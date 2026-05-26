"""A股财经新闻每日推送工作流"""
from __future__ import annotations
import logging
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph

logger = logging.getLogger(__name__)


def _get_state_class():
    from ..state import WorkflowState
    return WorkflowState


# ── Node functions ─────────────────────────────────────────────────────────

async def fetch_news(state, config: RunnableConfig) -> dict:
    """获取最新A股财经新闻"""
    from ...src.utils.rss_collector import get_stock_news
    news_items = get_stock_news(max_items=10)
    return {"raw_news": news_items}


async def process_content(state, config: RunnableConfig) -> dict:
    """提取并整理10条关键新闻内容"""
    from ...src.utils.rss_collector import format_news_message
    raw_news = state.get("raw_news", [])
    if not raw_news:
        return {"formatted_content": "⚠️ 未能获取到今日新闻"}
    
    formatted = format_news_message(raw_news[:10])
    return {"formatted_content": formatted}


async def save_and_notify(state, config: RunnableConfig) -> dict:
    """保存结果并发送通知"""
    from ...src.storage.news_store import save_output
    content = state.get("formatted_content", "")
    
    # 保存到本地
    saved_path = save_output(content, "daily_finance_news")
    
    # 返回结果
    return {
        "final_output": content,
        "saved_path": str(saved_path) if saved_path else None
    }


# ── Graph factory ──────────────────────────────────────────────────────────

def make_finance_news_push_graph() -> StateGraph:
    WorkflowState = _get_state_class()
    builder = StateGraph(WorkflowState)

    builder.add_node("fetch_news", fetch_news)
    builder.add_node("process_content", process_content)
    builder.add_node("save_and_notify", save_and_notify)

    builder.add_edge(START, "fetch_news")
    builder.add_edge("fetch_news", "process_content")
    builder.add_edge("process_content", save_and_notify)
    builder.add_edge("save_and_notify", END)

    return builder