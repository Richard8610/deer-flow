"""
DeerFlow Hub — FastAPI application.

Endpoints:
  POST /register   — create a new user account
  POST /login      — authenticate and receive a JWT; provisions user's DeerFlow pod
  GET  /me         — return info about the authenticated user and their pod URL
  POST /logout     — delete the user's pod (data PVC is preserved)
  GET  /health     — liveness probe
  ANY  /api/{path} — transparent reverse proxy to the user's DeerFlow pod
"""

import logging

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from auth import create_access_token, decode_token, hash_password, verify_password
from config import settings
from k8s_manager import delete_user_pod, ensure_user_pod, get_user_pod_url
from models import create_user, get_user_by_username, init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="DeerFlow Hub", version="1.0.0")
bearer_scheme = HTTPBearer()


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
    """Dependency: decode JWT and return the user record."""
    payload = decode_token(credentials.credentials)
    username: str | None = payload.get("sub")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
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
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="username and password are required",
        )
    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="password must be at least 8 characters",
        )

    hashed = hash_password(password)
    try:
        await create_user(username, hashed)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc

    return {"message": f"User '{username}' registered successfully."}


@app.post("/login")
async def login(request: Request) -> dict:
    body = await request.json()
    username: str = body.get("username", "").strip()
    password: str = body.get("password", "")

    user = await get_user_by_username(username)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )

    from auth import verify_password as _vp  # noqa: PLC0415 (already imported)
    if not verify_password(password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )

    # Provision user pod in background (best-effort; pod may take a moment to be Running)
    try:
        await ensure_user_pod(str(user["id"]))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not provision pod for user %s: %s", username, exc)

    token = create_access_token({"sub": username})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/me")
async def me(current_user: dict = Depends(get_current_user)) -> dict:
    pod_url = await get_user_pod_url(str(current_user["id"]))
    return {
        "username": current_user["username"],
        "pod_url": pod_url,
    }


@app.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)) -> dict:
    try:
        await delete_user_pod(str(current_user["id"]))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Error deleting pod for user %s: %s", current_user["username"], exc)
    return {"message": "Logged out. Your pod has been stopped; data is preserved."}


# ---------------------------------------------------------------------------
# Transparent reverse proxy: /api/{path}
# ---------------------------------------------------------------------------


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy(path: str, request: Request, current_user: dict = Depends(get_current_user)):
    """
    Forward all /api/* requests to the user's DeerFlow pod.
    Streams the response so SSE (Server-Sent Events) works correctly.
    """
    user_id = str(current_user["id"])
    pod_url = await get_user_pod_url(user_id)
    if pod_url is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Your DeerFlow pod is not ready yet. Please try again in a moment.",
        )

    target_url = f"{pod_url}/api/{path}"
    if request.url.query:
        target_url = f"{target_url}?{request.url.query}"

    # Build headers to forward, injecting the user id
    forward_headers = dict(request.headers)
    forward_headers.pop("host", None)
    forward_headers["x-user-id"] = user_id

    body = await request.body()

    async def _stream_response():
        async with httpx.AsyncClient(timeout=httpx.Timeout(600.0)) as client:
            async with client.stream(
                method=request.method,
                url=target_url,
                headers=forward_headers,
                content=body,
            ) as upstream:
                async for chunk in upstream.aiter_bytes():
                    yield chunk

    # Peek at content-type to decide streaming vs buffered
    async with httpx.AsyncClient(timeout=httpx.Timeout(600.0)) as client:
        upstream_resp = await client.request(
            method=request.method,
            url=target_url,
            headers=forward_headers,
            content=body,
        )

    content_type = upstream_resp.headers.get("content-type", "")

    # Use streaming for SSE
    if "text/event-stream" in content_type:
        return StreamingResponse(
            _stream_response(),
            status_code=upstream_resp.status_code,
            headers=dict(upstream_resp.headers),
            media_type="text/event-stream",
        )

    return StreamingResponse(
        iter([upstream_resp.content]),
        status_code=upstream_resp.status_code,
        headers={
            k: v
            for k, v in upstream_resp.headers.items()
            if k.lower() not in ("transfer-encoding",)
        },
        media_type=content_type or "application/octet-stream",
    )