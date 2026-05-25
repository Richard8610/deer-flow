"""AI News Daily StateGraph: fetch RSS → score → LLM digest → notify & save."""
from __future__ import annotations

import logging
from datetime import datetime

from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph

from ..storage.digest_store import save_digest
from ..utils.notifier import Notifier
from ..utils.rss_collector import AINewsCollector

logger = logging.getLogger(__name__)

# ── Prompt for the format_digest node ─────────────────────────────────────

_FORMAT_DIGEST_PROMPT = """\
You are an AI news editor.  Format the following top AI news stories into a
concise daily digest.  For each story include:
- A bold title (verbatim from the feed)
- A one-sentence summary (≤ 200 characters, plain text, no HTML)
- The direct article URL

Use the exact structure below (replace placeholders):

🤖 **Daily AI Industry News — {date}**

1. **<title>**
<summary>
🔗 <url>

2. **<title>**
<summary>
🔗 <url>

3. **<title>**
<summary>
🔗 <url>

---
Automated by AI Daily News Workflow

Stories to format:
{top_news}
"""


# ── Helpers ────────────────────────────────────────────────────────────────


def _get_state_class():
    from ..state import WorkflowState

    return WorkflowState


def _parse_config(state: dict) -> dict:
    """Extract notification config and runtime parameters from state."""
    return state.get("workflow_config", {}) or {}


# ── Node functions ─────────────────────────────────────────────────────────


async def fetch_and_score_node(state, config: RunnableConfig) -> dict:
    """Fetch RSS feeds, score articles, and store the top-N results."""
    workflow_cfg = _parse_config(state)
    top_n = int(workflow_cfg.get("top_n", 3))

    logger.info("Fetching and scoring RSS feeds (top_n=%d)", top_n)
    collector = AINewsCollector()
    top_news = collector.get_top_news(top_n=top_n)

    # Normalise to the keys the next nodes expect.
    results = [
        {
            "title": item.get("title", ""),
            "link": item.get("link", ""),
            "summary": item.get("summary", ""),
            "score": item.get("score", 0),
        }
        for item in top_news
    ]

    logger.info("Fetched %d scored stories", len(results))
    return {"execution_results": results}


async def format_digest_node(state, config: RunnableConfig) -> dict:
    """Call the LLM to produce a polished digest from the scored stories."""
    from deerflow.config import get_app_config
    from deerflow.models import create_chat_model

    top_news = state.get("execution_results") or []
    date_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Build a compact text representation for the LLM.
    stories_text = "\n\n".join(
        f"Title: {item['title']}\nSummary: {item['summary']}\nURL: {item['link']}"
        for item in top_news
    )

    prompt = _FORMAT_DIGEST_PROMPT.format(date=date_str, top_news=stories_text)

    model = create_chat_model(thinking_enabled=False, app_config=get_app_config())
    response = await model.ainvoke([HumanMessage(content=prompt)])
    digest = response.content if isinstance(response.content, str) else str(response.content)

    logger.info("Digest formatted by LLM (%d chars)", len(digest))
    return {"final_output": digest}


async def send_notification_node(state, config: RunnableConfig) -> dict:
    """Deliver the digest via the configured notification method and save to disk."""
    digest = state.get("final_output", "")
    workflow_cfg = _parse_config(state)

    method = workflow_cfg.get("method", "file")
    notifier_config = workflow_cfg.get("notifier_config", {})

    # Deliver.
    notifier = Notifier()
    success = notifier.send(digest, method=method, config=notifier_config)
    status_line = f"\n\n---\nDelivery ({method}): {'succeeded' if success else 'failed'}"

    # Save digest to disk.
    date_str = datetime.now().strftime("%Y%m%d")
    saved_path = save_digest(digest, date_str)
    location = f"\n📄 Digest saved to: `{saved_path}`" if saved_path else ""

    final = digest + status_line + location
    logger.info("Notification sent=%s, saved=%s", success, saved_path)
    return {"final_output": final, "messages": [AIMessage(content=final)]}


# ── Graph factory ──────────────────────────────────────────────────────────


def make_ai_news_daily_graph() -> StateGraph:
    """Return the AI News Daily StateGraph (uncompiled).

    Flow::

        START → fetch_and_score → format_digest → send_notification → END
    """
    WorkflowState = _get_state_class()
    builder = StateGraph(WorkflowState)

    builder.add_node("fetch_and_score", fetch_and_score_node)
    builder.add_node("format_digest", format_digest_node)
    builder.add_node("send_notification", send_notification_node)

    builder.add_edge(START, "fetch_and_score")
    builder.add_edge("fetch_and_score", "format_digest")
    builder.add_edge("format_digest", "send_notification")
    builder.add_edge("send_notification", END)

    return builder