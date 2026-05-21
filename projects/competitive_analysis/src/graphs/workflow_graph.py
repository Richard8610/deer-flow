"""Generic task-decompose → subagent-execute → evaluate → synthesize StateGraph."""
from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from ..nodes import (
    decompose_node,
    evaluate_node,
    execute_node,
    parse_input_node,
    plan_workflow_node,
    prepare_retry_node,
    search_skills_node,
    synthesize_node,
)
from ..state import WorkflowState


def _should_retry(state: WorkflowState) -> str:
    if state.get("all_passed", True):
        return "synthesize"
    if (state.get("retry_count") or 0) >= 2:
        return "synthesize"
    return "prepare_retry"


def make_workflow_graph() -> StateGraph:
    builder = StateGraph(WorkflowState)

    builder.add_node("parse_input", parse_input_node)
    builder.add_node("decompose", decompose_node)
    builder.add_node("search_skills", search_skills_node)
    builder.add_node("plan_workflow", plan_workflow_node)
    builder.add_node("execute", execute_node)
    builder.add_node("evaluate", evaluate_node)
    builder.add_node("prepare_retry", prepare_retry_node)
    builder.add_node("synthesize", synthesize_node)

    builder.add_edge(START, "parse_input")
    builder.add_edge("parse_input", "decompose")
    builder.add_edge("decompose", "search_skills")
    builder.add_edge("search_skills", "plan_workflow")
    builder.add_edge("plan_workflow", "execute")
    builder.add_edge("execute", "evaluate")
    builder.add_conditional_edges("evaluate", _should_retry, {"prepare_retry": "prepare_retry", "synthesize": "synthesize"})
    builder.add_edge("prepare_retry", "execute")
    builder.add_edge("synthesize", END)

    return builder