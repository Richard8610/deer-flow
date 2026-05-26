"""
DeerFlow Hub — FastAPI application.

Endpoints:
  POST /register   — create a new user account
  POST /login      — authenticate and receive a JWT; provisions user's DeerFlow pod
  GET  /me         — return info about the authenticated user and their pod URL
  POST /logout     — delete the user's pod (data PVC is preserved)
  GET  /health     — liveness probe
  ANY  /api/{path} — transparent reverse proxy to the user's DeerFlow pod (auto-inits DeerFlow)
  GET  /           — serves the frontend SPA (static files)
"""

import asyncio
import json
import logging
import os
import re
import time
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import Response, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles

from auth import create_access_token, decode_token, hash_password, verify_password
from config import settings
from k8s_manager import delete_user_pod, ensure_user_pod, get_user_pod_url
from models import create_user, get_user_by_username, init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="DeerFlow Hub", version="1.0.0")
bearer_scheme = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# Per-user DeerFlow session management
# Each user's pod runs a fresh DeerFlow instance that must be initialized
# with an admin account before it can accept requests.
# ---------------------------------------------------------------------------

# user_id -> (httpx.AsyncClient with DeerFlow cookies, csrf_token)
_df_sessions: dict[str, tuple[httpx.AsyncClient, str]] = {}
_df_init_locks: dict[str, asyncio.Lock] = {}
# Strong references to background tasks so GC doesn't kill them mid-execution.
_bg_tasks: set[asyncio.Task] = set()

_DF_ADMIN_EMAIL = os.getenv("DEERFLOW_ADMIN_EMAIL", "admin@deerflow.ai")


def _df_password(user_id: str) -> str:
    """Derive a deterministic DeerFlow admin password from user_id + hub secret.

    Reproducible across hub restarts so a re-initialised hub can re-authenticate
    with an already-initialised DeerFlow pod.
    """
    import hashlib, hmac as _hmac
    h = _hmac.new(settings.secret_key.encode(), user_id.encode(), hashlib.sha256).hexdigest()
    return f"Df#{h[:24]}!"


async def _get_df_session(user_id: str, pod_url: str) -> tuple[httpx.AsyncClient, str]:
    """Return an authenticated httpx client for this user's DeerFlow pod.

    On the first call, initializes the DeerFlow admin account and logs in.
    Retries if the pod is still starting up.
    """
    if user_id in _df_sessions:
        return _df_sessions[user_id]

    if user_id not in _df_init_locks:
        _df_init_locks[user_id] = asyncio.Lock()

    async with _df_init_locks[user_id]:
        # Re-check after acquiring lock
        if user_id in _df_sessions:
            return _df_sessions[user_id]

        client = httpx.AsyncClient(follow_redirects=True, timeout=30.0, trust_env=False)
        password = _df_password(user_id)

        # Wait for DeerFlow to be up and initialize admin (retry up to 15×3s = 45s)
        initialized = False
        for attempt in range(15):
            try:
                r = await client.post(
                    f"{pod_url}/api/v1/auth/initialize",
                    json={"email": _DF_ADMIN_EMAIL, "password": password},
                )
                logger.info("[user:%s] DeerFlow initialize status=%d body=%s", user_id, r.status_code, r.text[:200])
                if r.status_code in (200, 201, 409):
                    initialized = True
                    break
            except Exception as exc:
                logger.warning("[user:%s] DeerFlow init attempt %d/15 failed: %s", user_id, attempt + 1, exc)
                if attempt < 14:
                    await asyncio.sleep(3)

        if not initialized:
            logger.error("[user:%s] DeerFlow failed to initialize after 15 attempts", user_id)
            raise RuntimeError(f"DeerFlow pod at {pod_url} did not become ready")

        # Login to get session cookie + CSRF token
        csrf_token = ""
        r = await client.post(
            f"{pod_url}/api/v1/auth/login/local",
            data={"username": _DF_ADMIN_EMAIL, "password": password},
        )
        logger.info("[user:%s] DeerFlow login status=%d cookies=%s", user_id, r.status_code, dict(client.cookies))
        r.raise_for_status()
        csrf_token = client.cookies.get("csrf_token", "")
        logger.info("[user:%s] DeerFlow session established (csrf=%s)", user_id, "ok" if csrf_token else "missing")

        _df_sessions[user_id] = (client, csrf_token)
        return client, csrf_token


def _invalidate_df_session(user_id: str) -> None:
    session = _df_sessions.pop(user_id, None)
    if session:
        client, _ = session
        asyncio.create_task(client.aclose())


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------


@app.on_event("startup")
async def startup_event() -> None:
    await init_db()
    logger.info("Database initialised at %s", settings.db_path)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    username: str | None = payload.get("sub")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = await get_user_by_username(username)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/register", status_code=status.HTTP_201_CREATED)
async def register(request: Request) -> dict:
    body = await request.json()
    username: str = body.get("username", "").strip()
    password: str = body.get("password", "")

    if not username or not password:
        raise HTTPException(status_code=422, detail="username and password are required")
    if len(password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    hashed = hash_password(password)
    try:
        await create_user(username, hashed)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return {"message": f"User '{username}' registered successfully."}


@app.post("/login")
async def login(request: Request) -> dict:
    body = await request.json()
    username: str = body.get("username", "").strip()
    password: str = body.get("password", "")

    user = await get_user_by_username(username)
    if user is None or not verify_password(password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    try:
        await ensure_user_pod(str(user["id"]))
    except Exception as exc:
        logger.warning("Could not provision pod for %s: %s", username, exc)

    token = create_access_token({"sub": username})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/me")
async def me(current_user: dict = Depends(get_current_user)) -> dict:
    user_id = str(current_user["id"])
    pod_url = await get_user_pod_url(user_id)
    pod_ready = pod_url is not None

    # If pod is running, kick off DeerFlow session init in the background
    # so it's ready by the time the user sends their first message.
    if pod_ready and user_id not in _df_sessions:
        async def _bg_init():
            try:
                await _get_df_session(user_id, pod_url)
            except Exception as exc:
                logger.error("[user:%s] Background DeerFlow init failed: %s", user_id, exc)
        task = asyncio.create_task(_bg_init())
        _bg_tasks.add(task)
        task.add_done_callback(_bg_tasks.discard)

    return {"username": current_user["username"], "pod_ready": pod_ready}


@app.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)) -> dict:
    user_id = str(current_user["id"])
    _invalidate_df_session(user_id)
    try:
        await delete_user_pod(user_id)
    except Exception as exc:
        logger.warning("Error deleting pod for %s: %s", current_user["username"], exc)
    return {"message": "Logged out. Your pod has been stopped; data is preserved."}


# ---------------------------------------------------------------------------
# Workflow project persistence: /api/workflow/*
# Stored per-user on the hub's PVC at /data/projects/{user_id}/{project}/
# Must be registered BEFORE the catch-all /api/{path} proxy.
# ---------------------------------------------------------------------------

def _projects_root(user_id: str) -> Path:
    root = Path(settings.db_path).parent / "projects" / user_id
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_project_path(user_id: str, name: str) -> Path:
    root = _projects_root(user_id)
    resolved = (root / name).resolve()
    if not resolved.is_relative_to(root.resolve()):
        raise HTTPException(status_code=400, detail="Invalid project name")
    return resolved


@app.get("/api/workflow/projects")
async def list_projects(current_user: dict = Depends(get_current_user)) -> dict:
    root = _projects_root(str(current_user["id"]))
    projects = sorted(d.name for d in root.iterdir() if d.is_dir() and not d.name.startswith("."))
    return {"projects": projects}


@app.get("/api/workflow/projects/{name}")
async def get_workflow(name: str, current_user: dict = Depends(get_current_user)) -> dict:
    project_dir = _safe_project_path(str(current_user["id"]), name)
    wf_file = project_dir / "workflow.json"
    if not project_dir.exists() or not project_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Project '{name}' not found")
    if wf_file.exists():
        return json.loads(wf_file.read_text(encoding="utf-8"))
    return {"nodes": [], "edges": []}


@app.put("/api/workflow/projects/{name}")
async def save_workflow_endpoint(name: str, request: Request, current_user: dict = Depends(get_current_user)) -> dict:
    body = await request.json()
    project_dir = _safe_project_path(str(current_user["id"]), name)
    project_dir.mkdir(parents=True, exist_ok=True)
    wf_file = project_dir / "workflow.json"
    wf_file.write_text(json.dumps(body, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"ok": True}


@app.post("/api/workflow/projects")
async def create_project(request: Request, current_user: dict = Depends(get_current_user)) -> dict:
    body = await request.json()
    raw_name: str = body.get("name") or f"ai-workflow-{int(time.time())}"
    name = re.sub(r"[^a-zA-Z0-9_-]", "_", raw_name).strip("_-")[:80] or f"ai-workflow-{int(time.time())}"
    project_dir = _safe_project_path(str(current_user["id"]), name)
    project_dir.mkdir(parents=True, exist_ok=True)
    wf_file = project_dir / "workflow.json"
    wf_file.write_text(json.dumps(body.get("data", {}), indent=2, ensure_ascii=False), encoding="utf-8")
    return {"ok": True, "name": name}


# ---------------------------------------------------------------------------
# Transparent reverse proxy: /api/{path}
# Uses a per-user authenticated DeerFlow client (cookie session + CSRF).
# Detects SSE via Accept header to avoid double-requesting.
# ---------------------------------------------------------------------------


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy(path: str, request: Request, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["id"])
    pod_url = await get_user_pod_url(user_id)
    if pod_url is None:
        raise HTTPException(status_code=503, detail="Your DeerFlow pod is not ready yet.")

    df_client, csrf_token = await _get_df_session(user_id, pod_url)

    target_url = f"{pod_url}/api/{path}"
    if request.url.query:
        target_url = f"{target_url}?{request.url.query}"

    # Strip hub auth headers; inject CSRF for mutating requests
    forward_headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in ("host", "authorization", "cookie", "content-length")
    }
    if csrf_token and request.method.upper() in ("POST", "PUT", "PATCH", "DELETE"):
        forward_headers["X-CSRF-Token"] = csrf_token

    body = await request.body()
    accept = request.headers.get("accept", "")

    if "text/event-stream" in accept:
        # SSE: stream without buffering
        async def _sse_stream():
            async with df_client.stream(
                method=request.method,
                url=target_url,
                headers=forward_headers,
                content=body,
            ) as resp:
                async for chunk in resp.aiter_bytes():
                    yield chunk

        return StreamingResponse(_sse_stream(), media_type="text/event-stream")

    # Regular request: buffer response
    resp = await df_client.request(
        method=request.method,
        url=target_url,
        headers=forward_headers,
        content=body,
    )
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers={k: v for k, v in resp.headers.items()
                 if k.lower() not in ("transfer-encoding", "content-encoding")},
        media_type=resp.headers.get("content-type", "application/json"),
    )


# ---------------------------------------------------------------------------
# Static frontend — must be mounted LAST (catch-all)
# ---------------------------------------------------------------------------

_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_STATIC_DIR):
    app.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="static")
