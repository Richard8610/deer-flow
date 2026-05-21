"""Shared utilities: prompt templates and company name extraction."""
from .company_extractor import extract_company_name
from .prompts import (
    COMPANY_RESEARCH_PROMPT_TEMPLATE,
    COMPETITIVE_REPORT_PROMPT_TEMPLATE,
    COMPETITOR_RESEARCH_PROMPT_TEMPLATE,
    MARKET_RESEARCH_PROMPT_TEMPLATE,
)

__all__ = [
    "extract_company_name",
    "COMPANY_RESEARCH_PROMPT_TEMPLATE",
    "COMPETITOR_RESEARCH_PROMPT_TEMPLATE",
    "MARKET_RESEARCH_PROMPT_TEMPLATE",
    "COMPETITIVE_REPORT_PROMPT_TEMPLATE",
]