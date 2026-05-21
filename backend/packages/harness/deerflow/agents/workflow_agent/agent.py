"""LangGraph entry-point shim — delegates to projects/competitive_analysis/src/agent.py."""
from __future__ import annotations

import logging
import sys
from pathlib import Path

from langchain_core.runnables import RunnableConfig

logger = logging.getLogger(__name__)

# Add projects/ to sys.path so the competitive_analysis package is importable.
_projects_dir = Path(__file__).parents[6] / "projects"
if _projects_dir.exists() and str(_projects_dir) not in sys.path:
    sys.path.insert(0, str(_projects_dir))
    logger.debug("Added %s to sys.path", _projects_dir)


def make_workflow_agent(config: RunnableConfig):
    from competitive_analysis.src.agent import make_workflow_agent as _make

    return _make(config)


def make_competitive_analysis_agent(config: RunnableConfig):
    from competitive_analysis.src.agent import make_competitive_analysis_agent as _make

    return _make(config)