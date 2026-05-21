"""Subagent configuration helpers for the competitive analysis workflow."""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from deerflow.subagents.config import SubagentConfig


def make_researcher_config(name: str = "ca-researcher") -> "SubagentConfig":
    """Return a SubagentConfig for a competitive-analysis research subagent."""
    from deerflow.subagents.config import SubagentConfig

    return SubagentConfig(
        name=name,
        description="Competitive intelligence researcher: searches the web and synthesises findings.",
        system_prompt=(
            "You are a competitive intelligence analyst. "
            "Use web search to gather accurate, up-to-date information. "
            "Always cite your sources and clearly indicate when data is unavailable."
        ),
        tools=None,  # inherit all available tools
        disallowed_tools=["task"],
        model="inherit",
        max_turns=25,
        timeout_seconds=300,
    )