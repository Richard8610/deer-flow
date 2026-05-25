"""
Workflow persistence + chat proxy server.

Run from workflow_frontend/:
    uvicorn server.main:app --port 8002 --reload

Environment variables:
    DEERFLOW_URL       DeerFlow gateway base URL (default: http://localhost:8001)
    DEERFLOW_EMAIL     Login email for gateway auth  (default: admin@deerflow.ai)
    DEERFLOW_PASSWORD  Login password                (default: admin)

Reads / writes  ./projects/{name}/workflow.json  relative to the repo root.
"""

import os
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

PROJECTS_DIR = (Path(__file__).parent.parent.parent / "projects").resolve()
WORKFLOW_FILE = "workflow.json"

GW_BASE = os.getenv("DEERFLOW_URL", "http://localhost:8001")
GW_EMAIL = os.getenv("DEERFLOW_EMAIL", "admin@deerflow.ai")
GW_PASSWORD = os.getenv("DEERFLOW_PASSWORD", "admin")

app = FastAPI(title="Workflow Dev Server", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "PUT", "POST"],
    allow_headers=["*"],
)

# ── Gateway client (shared, persists cookies) ──────────────────────────────

_gw_client: httpx.AsyncClient | None = None


async def _gateway() -> httpx.AsyncClient:
    """Return an authenticated httpx client for the DeerFlow gateway."""
    global _gw_client
    if _gw_client is not None:
        return _gw_client

    _gw_client = httpx.AsyncClient(follow_redirects=True, timeout=300.0, trust_env=False)
    try:
        r = await _gw_client.post(
            f"{GW_BASE}/api/v1/auth/login/local",
            json={"email": GW_EMAIL, "password": GW_PASSWORD},
        )
        r.raise_for_status()
        print(f"[chat] authenticated with gateway as {GW_EMAIL}")
    except Exception as exc:
        print(f"[chat] warning — gateway auth failed: {exc}")
    return _gw_client


# ── Workflow persistence ────────────────────────────────────────────────────


def _project_path(name: str) -> Path:
    resolved = (PROJECTS_DIR / name).resolve()
    if not resolved.is_relative_to(PROJECTS_DIR):
        raise HTTPException(status_code=400, detail="Invalid project name")
    if not resolved.is_dir():
        raise HTTPException(status_code=404, detail=f"Project '{name}' not found")
    return resolved


@app.get("/api/workflow/projects")
def list_projects() -> dict[str, list[str]]:
    if not PROJECTS_DIR.exists():
        return {"projects": []}
    names = sorted(
        d.name
        for d in PROJECTS_DIR.iterdir()
        if d.is_dir() and not d.name.startswith(".") and (d / "src").is_dir()
    )
    return {"projects": names}


@app.get("/api/workflow/projects/{name}")
def get_workflow(name: str) -> dict[str, Any]:
    project = _project_path(name)
    wf_file = project / WORKFLOW_FILE
    if wf_file.exists():
        import json
        return json.loads(wf_file.read_text(encoding="utf-8"))
    return {"nodes": [], "edges": []}


@app.put("/api/workflow/projects/{name}")
def save_workflow(name: str, body: dict[str, Any]) -> dict[str, Any]:
    import json
    project = _project_path(name)
    wf_file = project / WORKFLOW_FILE
    wf_file.write_text(json.dumps(body, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"ok": True, "path": str(wf_file.relative_to(PROJECTS_DIR.parent))}


# ── Skills list ────────────────────────────────────────────────────────────

SKILLS_DIR = (Path(__file__).parent.parent.parent / "skills").resolve()


@app.get("/api/skills")
def list_skills() -> dict[str, list[dict]]:
    """Return skill name + description from public/ and custom/ subdirectories."""
    import re
    skills = []
    for sub in ("public", "custom"):
        subdir = SKILLS_DIR / sub
        if not subdir.exists():
            continue
        for skill_dir in sorted(subdir.iterdir()):
            md = skill_dir / "SKILL.md"
            if not md.exists():
                continue
            text = md.read_text(encoding="utf-8")
            # Extract YAML frontmatter between --- markers
            m = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
            if not m:
                continue
            fm = m.group(1)
            name_m = re.search(r"^name:\s*(.+)$", fm, re.MULTILINE)
            desc_m = re.search(r"^description:\s*(.+)$", fm, re.MULTILINE)
            if name_m:
                skills.append({
                    "name": name_m.group(1).strip(),
                    "description": desc_m.group(1).strip() if desc_m else "",
                    "category": sub,
                })
    return {"skills": skills}


# ── Chat proxy ─────────────────────────────────────────────────────────────


@app.post("/api/chat/stream")
async def chat_stream(body: dict[str, Any]) -> StreamingResponse:
    """
    Proxy a streaming chat request to the DeerFlow project_agent.

    Body:
      messages: [{"role": "user"|"assistant", "content": "..."}]
      project:  optional project name — used to select the agent
                (e.g. "competitive_analysis" → "competitive_analysis_agent")
    """
    messages: list[dict] = body.get("messages", [])
    project: str = body.get("project", "")
    assistant_id = f"{project}_agent" if project else "project_agent"

    client = await _gateway()

    async def _stream():
        try:
            async with client.stream(
                "POST",
                f"{GW_BASE}/api/runs/stream",
                json={
                    "assistant_id": assistant_id,
                    "input": {"messages": messages},
                    "stream_mode": ["messages-tuple"],
                    "on_completion": "delete",
                },
            ) as resp:
                async for chunk in resp.aiter_bytes():
                    yield chunk
        except Exception as exc:
            import json as _json
            msg = str(exc)
            if "connection" in msg.lower() or "connect" in msg.lower():
                msg = f"Cannot reach DeerFlow gateway at {GW_BASE}. Is the backend running? Try: make dev"
            yield f"event: error\ndata: {_json.dumps(msg)}\n\n".encode()

    return StreamingResponse(_stream(), media_type="text/event-stream")
