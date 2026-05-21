"""Extract a company name from a free-form user message."""
from __future__ import annotations

import re

_STRIP_PREFIXES = (
    "帮我做", "帮我", "请帮我", "请", "做一个", "做个", "生成",
    "分析", "竞品分析", "竞争分析", "研究",
    "analyze", "research", "competitive analysis of", "competitors of",
)

_STRIP_SUFFIXES = (
    "的竞品分析", "的竞争对手", "竞品分析", "竞争分析", "竞争对手",
    "competitive analysis", "competitors",
)


def extract_company_name(text: str) -> str:
    """Return the company name embedded in *text*, best-effort.

    Examples
    --------
    >>> extract_company_name("帮我做OpenAI竞品分析")
    'OpenAI'
    >>> extract_company_name("分析 字节跳动 的竞争对手")
    '字节跳动'
    >>> extract_company_name("competitive analysis of Salesforce")
    'Salesforce'
    """
    s = text.strip()

    # Strip leading prefixes (longest first to avoid partial matches)
    for prefix in sorted(_STRIP_PREFIXES, key=len, reverse=True):
        if s.lower().startswith(prefix.lower()):
            s = s[len(prefix):].strip()
            break

    # Strip trailing suffixes (longest first)
    for suffix in sorted(_STRIP_SUFFIXES, key=len, reverse=True):
        if s.lower().endswith(suffix.lower()):
            s = s[: -len(suffix)].strip()
            break

    # Remove surrounding punctuation and whitespace
    s = re.sub(r"^[\s：:，,。.！!？?]+|[\s：:，,。.！!？?]+$", "", s)

    return s or text.strip()