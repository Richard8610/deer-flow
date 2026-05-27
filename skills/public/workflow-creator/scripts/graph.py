"""General-purpose StateGraph factory that discovers project graphs from projects/.

``load_project_graph(name)`` probes (in order):
  1. ``<name>.src.graphs.<name>``          → ``make_<name>_graph()`` / ``make_graph()``
  2. ``<name>.src.graphs.workflow_graph``  → ``make_workflow_graph()``
  3. ``<name>.src.agent``                  → ``make_<name>_agent()`` / ``make_agent()``

Returns a zero-argument callable that returns a ``StateGraph`` builder, or ``None``
when the project folder is absent / has no recognised factory.  Callers call
``.compile()`` on the returned builder.

The built-in ``make_workflow_graph()`` is always available as a fallback.
"""
from __future__ import annotations

import importlib
import logging
from typing import Callable

from langgraph.graph import StateGraph

logger = logging.getLogger(__name__)


def load_project_graph(project_name: str) -> Callable[[], StateGraph] | None:
    """Return a zero-arg graph-builder for *project_name*, or ``None`` if not found.

    Naming convention for the project package: ``<project_name>.src.*``
    where *project_name* uses underscores (hyphens and spaces are normalised).
    """
    snake = project_name.replace("-", "_").replace(" ", "_").lower()

    # Probe list: (module dotted path, [function names to try in order])
    probes: list[tuple[str, list[str]]] = [
        (f"{snake}.src.graphs.{snake}", [f"make_{snake}_graph", "make_graph"]),
        (f"{snake}.src.graphs.workflow_graph", ["make_workflow_graph"]),
        (f"{snake}.src.agent", [f"make_{snake}_agent", "make_agent"]),
    ]

    for module_path, func_names in probes:
        try:
            mod = importlib.import_module(module_path)
        except ImportError:
            continue
        for fname in func_names:
            fn = getattr(mod, fname, None)
            if fn is not None:
                logger.debug("Resolved graph factory: %s.%s", module_path, fname)
                return fn

    logger.debug("No project graph found for '%s'", project_name)
    return None


def list_projects() -> list[str]:
    """Return names of project packages currently on sys.path."""
    import sys
    from pathlib import Path

    results: list[str] = []
    for base in sys.path:
        p = Path(base)
        if not p.is_dir():
            continue
        for child in sorted(p.iterdir()):
            if child.is_dir() and (child / "src").is_dir() and child.name not in results:
                results.append(child.name)
    return results


def make_workflow_graph() -> StateGraph:
    """Generic workflow graph where each subtask becomes its own node.

    After ``plan_workflow``, LangGraph's Send API fans out one ``execute_subtask``
    node per assignment — they run in parallel and are joined automatically before
    ``evaluate``.  On retry only the failed subtasks are re-dispatched.

    Shape::

        START → parse_input → decompose → search_skills → plan_workflow
                  ↘ Send×N ↘                              ↙ Send×M (retry)
                             execute_subtask ─────────────→ evaluate → synthesize → END
                                                              ↘ prepare_retry ↗
    """
    from langgraph.graph import END, START
    from langgraph.types import Send

    from .nodes import (
        decompose_node,
        evaluate_node,
        execute_subtask_node,
        parse_input_node,
        plan_workflow_node,
        prepare_retry_node,
        search_skills_node,
        synthesize_node,
    )
    from .state import WorkflowState

    def _route_subtasks(state):
        """Return one Send per assignment, or fall through to evaluate when empty."""
        assignments = state.get("subagent_assignments") or []
        if not assignments:
            return "evaluate"
        return [
            Send("execute_subtask", {
                "subtask_id": a.get("subtask_id", str(i)),
                "prompt": a.get("prompt", ""),
                "subagent_type": a.get("subagent_type", "general-purpose"),
            })
            for i, a in enumerate(assignments)
        ]

    def _should_retry(state) -> str:
        if state.get("all_passed", True):
            return "synthesize"
        if (state.get("retry_count") or 0) >= 2:
            return "synthesize"
        return "prepare_retry"

    builder = StateGraph(WorkflowState)
    builder.add_node("parse_input", parse_input_node)
    builder.add_node("decompose", decompose_node)
    builder.add_node("search_skills", search_skills_node)
    builder.add_node("plan_workflow", plan_workflow_node)
    builder.add_node("execute_subtask", execute_subtask_node)
    builder.add_node("evaluate", evaluate_node)
    builder.add_node("prepare_retry", prepare_retry_node)
    builder.add_node("synthesize", synthesize_node)

    builder.add_edge(START, "parse_input")
    builder.add_edge("parse_input", "decompose")
    builder.add_edge("decompose", "search_skills")
    builder.add_edge("search_skills", "plan_workflow")
    builder.add_conditional_edges("plan_workflow", _route_subtasks, ["execute_subtask", "evaluate"])
    builder.add_edge("execute_subtask", "evaluate")
    builder.add_conditional_edges("evaluate", _should_retry, {"prepare_retry": "prepare_retry", "synthesize": "synthesize"})
    builder.add_conditional_edges("prepare_retry", _route_subtasks, ["execute_subtask", "evaluate"])
    builder.add_edge("synthesize", END)
    return builder


def make_project_graph(project_name: str) -> StateGraph:
    """Load and return the graph builder for any named project.

    Uses ``load_project_graph`` for discovery; falls back to
    ``make_workflow_graph()`` when the project has no custom graph.
    """
    factory = load_project_graph(project_name)
    if factory is None:
        logger.warning("No graph found for project '%s'; using generic workflow", project_name)
        return make_workflow_graph()
    return factory()