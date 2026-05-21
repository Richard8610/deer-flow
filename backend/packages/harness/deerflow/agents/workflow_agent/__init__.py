"""Workflow agent package.

Registered LangGraph graphs:
- ``make_workflow_agent``             — generic decompose/execute/evaluate pipeline
- ``make_competitive_analysis_agent`` — company → parallel research → report

Dynamic loader:
- ``make_project_agent(project_name, config)`` — load any project from projects/
"""
from .agent import make_competitive_analysis_agent, make_project_agent, make_workflow_agent

__all__ = ["make_competitive_analysis_agent", "make_project_agent", "make_workflow_agent"]