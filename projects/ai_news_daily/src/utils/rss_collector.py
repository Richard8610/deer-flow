"""RSS feed fetching and scoring logic for the AI News Daily workflow.

Public API
----------
get_top_news(top_n=3) -> list[dict]
    Fetch all feeds, score each article, and return the top-N items.
    Each item has keys: ``title``, ``link``, ``summary``, ``score``.

format_news_message(top_news) -> str
    Format a list of scored news items into a human-readable digest string.
"""
from __future__ import annotations

import logging
import re
from collections import Counter
from datetime import datetime

logger = logging.getLogger(__name__)

# Default RSS feed URLs.  Override via config/workflow.yaml ``collector.feeds``.
DEFAULT_FEEDS: list[str] = [
    "https://ai.googleblog.com/atom.xml",
    "https://openai.com/blog/rss.xml",
    "https://www.aitimes.com/rss",
    "https://techcrunch.com/category/artificial-intelligence/feed/",
    "https://www.kdnuggets.com/feed",
]

# Keywords that receive double weight in the relevance score.
_AI_KEYWORDS: frozenset[str] = frozenset([
    "ai", "artificial", "intelligence", "machine", "learning", "model",
    "llm", "gpt", "chatbot", "neural", "deep", "openai", "google",
    "gemini", "transformer",
])

# Common English stop words to exclude from keyword extraction.
_ENGLISH_STOP_WORDS: frozenset[str] = frozenset([
    "the", "and", "for", "are", "but", "not", "you", "all", "can",
    "had", "her", "was", "one", "our", "out", "day", "get", "has",
    "him", "his", "how", "its", "may", "new", "now", "old", "see",
    "two", "way", "who", "did", "its", "let", "put", "say", "she",
    "too", "use", "with", "that", "have", "this", "from", "they",
    "will", "been", "said", "each", "which", "their", "time", "about",
    "when", "more", "also", "into", "than", "then", "some", "just",
    "over", "such", "your", "what", "were", "there", "been", "other",
])


class AINewsCollector:
    """Collect, score, and format AI news from RSS feeds."""

    def __init__(self, feeds: list[str] | None = None) -> None:
        self.feeds = feeds or DEFAULT_FEEDS

    # ── Internal helpers ──────────────────────────────────────────────────

    def _get_news_from_feeds(self) -> list[dict]:
        """Fetch all RSS feeds and return a flat list of raw news items."""
        try:
            import feedparser  # type: ignore[import]
        except ImportError as exc:
            raise ImportError(
                "feedparser is required: uv add feedparser"
            ) from exc

        all_news: list[dict] = []
        for feed_url in self.feeds:
            try:
                feed = feedparser.parse(feed_url)
                for entry in feed.entries:
                    all_news.append({
                        "title": getattr(entry, "title", ""),
                        "link": getattr(entry, "link", ""),
                        "summary": entry.get("summary", entry.get("description", "")),
                        "published": entry.get("published", entry.get("updated", datetime.now().isoformat())),
                        "source": feed_url,
                    })
            except Exception:
                logger.warning("Failed to fetch feed: %s", feed_url, exc_info=True)

        logger.info("Fetched %d articles from %d feeds", len(all_news), len(self.feeds))
        return all_news

    def _extract_keywords(self, text: str) -> list[tuple[str, int]]:
        """Return the top-10 (keyword, count) pairs from *text*."""
        words = re.findall(r"[a-zA-Z]{3,}", text.lower())
        words = [w for w in words if w not in _ENGLISH_STOP_WORDS]
        return Counter(words).most_common(10)

    def _score_item(self, item: dict) -> int:
        """Return an AI-relevance score for a single news item."""
        text = f"{item.get('title', '')} {item.get('summary', '')}"
        score = 0
        for keyword, count in self._extract_keywords(text):
            score += count * 2 if keyword in _AI_KEYWORDS else count
        return score

    # ── Public API ────────────────────────────────────────────────────────

    def get_top_news(self, top_n: int = 3) -> list[dict]:
        """Fetch feeds, score articles, and return the *top_n* items.

        Each returned dict has these keys:
        ``title``, ``link``, ``summary``, ``score``.
        """
        all_news = self._get_news_from_feeds()
        for item in all_news:
            item["score"] = self._score_item(item)

        sorted_news = sorted(all_news, key=lambda x: x["score"], reverse=True)
        top = sorted_news[:top_n]

        # Normalise: strip HTML from summary and enforce char limit.
        for item in top:
            raw_summary = re.sub(r"<[^<]+?>", "", item.get("summary", ""))
            if len(raw_summary) > 200:
                raw_summary = raw_summary[:200] + "..."
            item["summary"] = raw_summary

        logger.info("Top %d articles selected (scores: %s)", top_n, [i["score"] for i in top])
        return top

    def format_news_message(self, top_news: list[dict]) -> str:
        """Format *top_news* into a human-readable Markdown digest string."""
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        lines: list[str] = [f"🤖 **Daily AI Industry News — {now}**\n"]

        for i, item in enumerate(top_news, 1):
            lines.append(f"{i}. **{item['title']}**")
            lines.append(item.get("summary", ""))
            lines.append(f"🔗 {item['link']}\n")

        lines.append("---")
        lines.append("Automated by AI Daily News Workflow")
        return "\n".join(lines)


# ── Module-level convenience wrappers ─────────────────────────────────────


def get_top_news(top_n: int = 3) -> list[dict]:
    """Module-level shortcut: collect and return the top *top_n* AI news items."""
    return AINewsCollector().get_top_news(top_n=top_n)


def format_news_message(top_news: list[dict]) -> str:
    """Module-level shortcut: format a list of scored news items into a digest."""
    return AINewsCollector().format_news_message(top_news)