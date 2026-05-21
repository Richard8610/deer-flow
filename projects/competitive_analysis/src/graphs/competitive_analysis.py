"""Competitive analysis StateGraph: company → parallel research → report → save."""
from __future__ import annotations

import asyncio
import logging
import re
import uuid

from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph

from ..agents import make_researcher_config
from ..storage.report_store import save_report
from ..utils.company_extractor import extract_company_name
from ..utils.prompts import (
    COMPANY_RESEARCH_PROMPT_TEMPLATE,
    COMPETITIVE_REPORT_PROMPT_TEMPLATE,
    COMPETITOR_RESEARCH_PROMPT_TEMPLATE,
    MARKET_RESEARCH_PROMPT_TEMPLATE,
)

logger = logging.getLogger(__name__)

_POLL_INTERVAL = 5      # seconds between polling cycles
_MAX_POLLS = 180        # 15-minute ceiling (180 × 5 s)


# ── Helpers ────────────────────────────────────────────────────────────────


def _last_human_text(messages: list) -> str:
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            content = msg.content
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                return " ".join(b.get("text", "") if isinstance(b, dict) else str(b) for b in content)
    return ""


async def _run_parallel(assignments: list[dict]) -> dict[str, str]:
    """Launch one subagent per assignment and return {subtask_id: result} when all finish."""
    from deerflow.config import get_app_config
    from deerflow.subagents import SubagentExecutor
    from deerflow.subagents.executor import SubagentStatus, cleanup_background_task, get_background_task_result
    from deerflow.tools import get_available_tools

    app_config = get_app_config()
    tools = get_available_tools(app_config=app_config)
    researcher_cfg = make_researcher_config()

    running: list[tuple[str, str]] = []
    for a in assignments:
        executor = SubagentExecutor(config=researcher_cfg, tools=tools, app_config=app_config, thread_id=str(uuid.uuid4()))
        task_id = executor.execute_async(a["prompt"])
        running.append((a["subtask_id"], task_id))
        logger.info("Started research task %s (%s)", task_id, a["subtask_id"])

    results: dict[str, str] = {}
    pending = list(running)
    polls = 0

    while pending and polls < _MAX_POLLS:
        await asyncio.sleep(_POLL_INTERVAL)
        polls += 1
        remaining = []
        for subtask_id, task_id in pending:
            bg = get_background_task_result(task_id)
            if bg is not None and bg.status.is_terminal:
                results[subtask_id] = bg.result or "" if bg.status == SubagentStatus.COMPLETED else f"[{bg.status.value}] {bg.error or ''}"
                cleanup_background_task(task_id)
                logger.info("Research task %s finished: %s", subtask_id, bg.status.value)
            else:
                remaining.append((subtask_id, task_id))
        pending = remaining

    for subtask_id, task_id in pending:
        results[subtask_id] = "[timed_out] Research did not complete within the time limit."
        cleanup_background_task(task_id)

    return results


# ── Shared state type ──────────────────────────────────────────────────────
# We import from the harness to stay consistent; the graph compiles the same
# WorkflowState used by the generic workflow agent.


def _get_state_class():
    from ..state import WorkflowState

    return WorkflowState


# ── Node functions ─────────────────────────────────────────────────────────


async def extract_company_node(state, config: RunnableConfig) -> dict:
    """Parse the company name from the user's message."""
    text = _last_human_text(state.get("messages", []))
    company = extract_company_name(text)
    logger.info("Target company: %s", company)
    return {"task_description": company}


async def research_node(state, config: RunnableConfig) -> dict:
    """Run company, competitor, and market research in parallel."""
    company = state.get("task_description", "Unknown")
    assignments = [
        {"subtask_id": "company", "prompt": COMPANY_RESEARCH_PROMPT_TEMPLATE.format(company=company)},
        {"subtask_id": "competitors", "prompt": COMPETITOR_RESEARCH_PROMPT_TEMPLATE.format(company=company)},
        {"subtask_id": "market", "prompt": MARKET_RESEARCH_PROMPT_TEMPLATE.format(company=company)},
    ]
    results_map = await _run_parallel(assignments)
    results = [{"subtask_id": k, "status": "completed", "result": v, "error": None} for k, v in results_map.items()]
    return {"execution_results": results}


async def generate_report_node(state, config: RunnableConfig) -> dict:
    """Synthesise all research into a structured Markdown report."""
    from deerflow.config import get_app_config
    from deerflow.models import create_chat_model

    company = state.get("task_description", "Unknown")
    results_map = {r["subtask_id"]: r["result"] for r in (state.get("execution_results") or [])}

    prompt = COMPETITIVE_REPORT_PROMPT_TEMPLATE.format(
        company=company,
        company_research=results_map.get("company", "未能获取数据"),
        competitor_research=results_map.get("competitors", "未能获取数据"),
        market_research=results_map.get("market", "未能获取数据"),
    )

    model = create_chat_model(thinking_enabled=False, app_config=get_app_config())
    response = await model.ainvoke([HumanMessage(content=prompt)])
    report = response.content if isinstance(response.content, str) else str(response.content)
    return {"final_output": report}


async def save_report_node(state, config: RunnableConfig) -> dict:
    """Write the report to disk and return it with a location notice."""
    report = state.get("final_output", "")
    company = state.get("task_description", "company")

    saved_path = save_report(report, company)
    location = f"\n\n---\n📄 报告已保存至：`{saved_path}`" if saved_path else ""
    final = report + location
    return {"final_output": final, "messages": [AIMessage(content=final)]}


# ── Graph factory ──────────────────────────────────────────────────────────


def make_competitive_analysis_graph() -> StateGraph:
    """Return a compiled competitive analysis StateGraph.

    Flow:
        START → extract_company → research → generate_report → save_report → END
    """
    WorkflowState = _get_state_class()
    builder = StateGraph(WorkflowState)

    builder.add_node("extract_company", extract_company_node)
    builder.add_node("research", research_node)
    builder.add_node("generate_report", generate_report_node)
    builder.add_node("save_report", save_report_node)

    builder.add_edge(START, "extract_company")
    builder.add_edge("extract_company", "research")
    builder.add_edge("research", "generate_report")
    builder.add_edge("generate_report", "save_report")
    builder.add_edge("save_report", END)

    return builder