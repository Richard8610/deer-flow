"""LangGraph-compatible factory functions for competitive_analysis graphs."""
from __future__ import annotations

import logging

from langchain_core.runnables import RunnableConfig

logger = logging.getLogger(__name__)


def make_workflow_agent(config: RunnableConfig):
    """Generic workflow agent: decomposes tasks, delegates to subagents, evaluates results."""
    logger.info("Creating workflow_agent graph")
    from .graphs.workflow_graph import make_workflow_graph

    return make_workflow_graph().compile()


def make_competitive_analysis_agent(config: RunnableConfig):
    """Competitive analysis agent: input a company name → professional report."""
    logger.info("Creating competitive_analysis_agent graph")
    from .graphs.competitive_analysis import make_competitive_analysis_graph

    return make_competitive_analysis_graph().compile()