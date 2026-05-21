"""Workflow creation agent package.

Exports two LangGraph-compatible graph factories:

- ``make_workflow_agent``: generic task-decompose / subagent-execute / evaluate graph
- ``make_competitive_analysis_agent``: company-name → parallel research → report pipeline
"""
from .agent import make_competitive_analysis_agent, make_workflow_agent

__all__ = ["make_competitive_analysis_agent", "make_workflow_agent"]