"""Canonical WorkflowState definition — shared by all workflow graphs."""
from __future__ import annotations

import operator
from typing import Annotated, NotRequired, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class WorkflowState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    task_description: NotRequired[str]
    subtasks: NotRequired[list[dict]]
    available_skills: NotRequired[list[str]]
    subagent_assignments: NotRequired[list[dict]]
    project_dir: NotRequired[str | None]
    # operator.add lets each execute_subtask node append its own result independently
    execution_results: Annotated[list[dict], operator.add]
    evaluation_results: NotRequired[list[dict]]
    all_passed: NotRequired[bool]
    retry_count: NotRequired[int]
    final_output: NotRequired[str | None]