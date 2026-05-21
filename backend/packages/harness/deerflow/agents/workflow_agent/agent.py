"""LangGraph entry-point factories for the workflow agent system.

Registered graphs (langgraph.json):
  - ``workflow_agent``              → make_workflow_agent
  - ``competitive_analysis_agent``  → make_competitive_analysis_agent

Dynamic use:
  - ``make_project_agent(project_name, config)`` loads any project in projects/.
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

from langchain_core.runnables import RunnableConfig

logger = logging.getLogger(__name__)

# Add projects/ to sys.path so any project package is importable by name.
_projects_dir = Path(__file__).parents[6] / "projects"
if _projects_dir.exists() and str(_projects_dir) not in sys.path:
    sys.path.insert(0, str(_projects_dir))
    logger.debug("Added %s to sys.path", _projects_dir)


def make_workflow_agent(config: RunnableConfig):
    """Generic workflow agent: decomposes tasks, delegates to subagents, evaluates results."""
    from .graph import make_workflow_graph

    return make_workflow_graph().compile()


def make_competitive_analysis_agent(config: RunnableConfig):
    """Competitive analysis agent: company name → parallel research → structured report."""
    from competitive_analysis.src.agent import make_competitive_analysis_agent as _make

    return _make(config)


def make_project_agent(project_name: str, config: RunnableConfig):
    """Load and compile the graph for any project in projects/.

    Resolution order (see graph.load_project_graph for details):
      1. <project>.src.graphs.<project>.make_<project>_graph()
      2. <project>.src.graphs.workflow_graph.make_workflow_graph()
      3. <project>.src.agent.make_<project>_agent() / make_agent()
      4. Built-in generic workflow graph (fallback)

    Example — add a new project and invoke it::

        make_project_agent("market_research", config)
    """
    from .graph import load_project_graph, make_workflow_graph

    factory = load_project_graph(project_name)
    if factory is None:
        logger.warning("No graph found for project '%s'; falling back to generic workflow", project_name)
        return make_workflow_graph().compile()
    result = factory()
    # factory may return a StateGraph builder or an already-compiled graph
    return result.compile() if hasattr(result, "compile") else result