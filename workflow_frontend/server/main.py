"""
Workflow persistence server.

Run from workflow_frontend/:
    uvicorn server.main:app --port 8002 --reload

Reads / writes  ./projects/{name}/workflow.json  relative to the repo root.
"""

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# repo root is three levels up from this file
PROJECTS_DIR = (Path(__file__).parent.parent.parent / "projects").resolve()
WORKFLOW_FILE = "workflow.json"

app = FastAPI(title="Workflow Persistence API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "PUT"],
    allow_headers=["*"],
)


def _project_path(name: str) -> Path:
    # Guard against path traversal
    resolved = (PROJECTS_DIR / name).resolve()
    if not resolved.is_relative_to(PROJECTS_DIR):
        raise HTTPException(status_code=400, detail="Invalid project name")
    if not resolved.is_dir():
        raise HTTPException(status_code=404, detail=f"Project '{name}' not found")
    return resolved


@app.get("/api/workflow/projects")
def list_projects() -> dict[str, list[str]]:
    """Return project directory names that contain a src/ subfolder."""
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
    """Return the saved workflow JSON, or an empty canvas if none exists yet."""
    project = _project_path(name)
    wf_file = project / WORKFLOW_FILE
    if wf_file.exists():
        import json
        return json.loads(wf_file.read_text(encoding="utf-8"))
    return {"nodes": [], "edges": []}


@app.put("/api/workflow/projects/{name}")
def save_workflow(name: str, body: dict[str, Any]) -> dict[str, Any]:
    """Persist workflow JSON to projects/{name}/workflow.json."""
    import json
    project = _project_path(name)
    wf_file = project / WORKFLOW_FILE
    wf_file.write_text(json.dumps(body, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"ok": True, "path": str(wf_file.relative_to(PROJECTS_DIR.parent))}
