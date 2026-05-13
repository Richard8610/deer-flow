import logging
from pathlib import Path

import yaml
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.gateway.deps import get_config
from deerflow.config.app_config import AppConfig, reload_app_config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["tools"])


class ToolResponse(BaseModel):
    name: str
    group: str
    use: str
    extras: dict = Field(default_factory=dict)


class ToolsListResponse(BaseModel):
    tools: list[ToolResponse]


class ToolGroupResponse(BaseModel):
    name: str


class ToolGroupsListResponse(BaseModel):
    tool_groups: list[ToolGroupResponse]


class CreateToolRequest(BaseModel):
    name: str = Field(..., description="Unique tool name (snake_case)")
    group: str = Field(..., description="Tool group name (e.g. web, bash, file:read)")
    use: str = Field(..., description="Python import path (e.g. module.path:variable_name)")
    extras: dict = Field(default_factory=dict, description="Additional config fields (e.g. max_results, timeout)")


class UpdateToolRequest(BaseModel):
    group: str | None = None
    use: str | None = None
    extras: dict | None = None


def _tool_data_to_response(tool_data: dict) -> ToolResponse:
    d = dict(tool_data)
    name = d.pop("name", "")
    group = d.pop("group", "")
    use = d.pop("use", "")
    return ToolResponse(name=name, group=group, use=use, extras=d)


def _read_raw_config() -> tuple[Path, dict]:
    config_path = AppConfig.resolve_config_path()
    with open(config_path, encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return config_path, data


def _write_raw_config(config_path: Path, data: dict) -> None:
    tmp = config_path.with_suffix(".tmp")
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
        tmp.replace(config_path)
    except Exception:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        raise
    reload_app_config()


@router.get("/tools", response_model=ToolsListResponse)
async def list_tools(config: AppConfig = Depends(get_config)) -> ToolsListResponse:
    tools = []
    for tool in config.tools:
        d = tool.model_dump()
        tools.append(_tool_data_to_response(d))
    return ToolsListResponse(tools=tools)


@router.get("/tool-groups", response_model=ToolGroupsListResponse)
async def list_tool_groups(config: AppConfig = Depends(get_config)) -> ToolGroupsListResponse:
    groups = [ToolGroupResponse(name=g.name) for g in config.tool_groups]
    return ToolGroupsListResponse(tool_groups=groups)


@router.post("/tools", response_model=ToolResponse, status_code=201)
async def create_tool(request: CreateToolRequest) -> ToolResponse:
    config_path, data = _read_raw_config()
    tools: list[dict] = list(data.get("tools") or [])

    if any(t.get("name") == request.name for t in tools):
        raise HTTPException(status_code=409, detail=f"Tool '{request.name}' already exists")

    entry: dict = {"name": request.name, "group": request.group, "use": request.use}
    entry.update(request.extras)
    tools.append(entry)
    data["tools"] = tools
    _write_raw_config(config_path, data)

    return ToolResponse(name=request.name, group=request.group, use=request.use, extras=dict(request.extras))


@router.put("/tools/{tool_name}", response_model=ToolResponse)
async def update_tool(tool_name: str, request: UpdateToolRequest) -> ToolResponse:
    config_path, data = _read_raw_config()
    tools: list[dict] = list(data.get("tools") or [])

    idx = next((i for i, t in enumerate(tools) if t.get("name") == tool_name), None)
    if idx is None:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")

    entry = dict(tools[idx])
    if request.group is not None:
        entry["group"] = request.group
    if request.use is not None:
        entry["use"] = request.use
    if request.extras is not None:
        for key in [k for k in list(entry) if k not in ("name", "group", "use")]:
            del entry[key]
        entry.update(request.extras)
    tools[idx] = entry
    data["tools"] = tools
    _write_raw_config(config_path, data)

    return _tool_data_to_response(dict(entry))


@router.delete("/tools/{tool_name}")
async def delete_tool(tool_name: str) -> dict[str, bool]:
    config_path, data = _read_raw_config()
    tools: list[dict] = list(data.get("tools") or [])

    new_tools = [t for t in tools if t.get("name") != tool_name]
    if len(new_tools) == len(tools):
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")

    data["tools"] = new_tools
    _write_raw_config(config_path, data)
    return {"success": True}
