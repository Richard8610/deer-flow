"""Re-exports generic prompts from the harness.

CA-specific prompts (COMPANY_RESEARCH_PROMPT_TEMPLATE etc.) live in src/utils/prompts.py.
"""
from deerflow.agents.workflow_agent.prompts import DECOMPOSE_PROMPT, EVALUATE_PROMPT, PLAN_PROMPT, SYNTHESIZE_PROMPT  # noqa: F401

__all__ = ["DECOMPOSE_PROMPT", "EVALUATE_PROMPT", "PLAN_PROMPT", "SYNTHESIZE_PROMPT"]