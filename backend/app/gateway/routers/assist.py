"""Lightweight direct-LLM chat endpoint for the dashboard AI Assist feature."""

import json
import logging
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.gateway.deps import get_config
from deerflow.config.app_config import AppConfig
from deerflow.models import create_chat_model

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["assist"])


class AssistRequest(BaseModel):
    message: str = Field(..., description="User message")
    system_hint: str | None = Field(default=None, description="System prompt prefix")
    model_name: str | None = Field(default=None, description="Optional model override")


def _extract_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") in {"text", "output_text"}:
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return ""


async def _stream_response(body: AssistRequest, config: AppConfig) -> AsyncGenerator[str, None]:
    model = create_chat_model(name=body.model_name, thinking_enabled=False, app_config=config)
    messages = []
    if body.system_hint:
        messages.append(SystemMessage(content=body.system_hint))
    messages.append(HumanMessage(content=body.message))

    try:
        async for chunk in model.astream(messages):
            text = _extract_text(chunk.content)
            if text:
                yield f"data: {json.dumps({'text': text})}\n\n"
    except Exception as exc:
        logger.exception("Assist stream error: %s", exc)
        yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    yield "data: [DONE]\n\n"


@router.post(
    "/assist",
    summary="AI Assist — direct LLM stream",
    description="Stream a response from the configured LLM without going through the full agent pipeline. Used by the dashboard AI Assist feature.",
)
async def assist(
    body: AssistRequest,
    config: AppConfig = Depends(get_config),
) -> StreamingResponse:
    return StreamingResponse(
        _stream_response(body, config),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )