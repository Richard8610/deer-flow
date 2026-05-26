#!/usr/bin/env python3
"""CLI runner for the AI News Daily workflow.

Usage
-----
From the repository root::

    # Write digest to a local file (default)
    uv run python projects/ai_news_daily/src/run_news.py --method file

    # Send via Telegram (credentials from env or config.json)
    uv run python projects/ai_news_daily/src/run_news.py --method telegram

    # POST to a webhook
    uv run python projects/ai_news_daily/src/run_news.py --method webhook

    # Fetch top 5 stories instead of 3
    uv run python projects/ai_news_daily/src/run_news.py --top-n 5

    # Load credentials from a JSON file
    uv run python projects/ai_news_daily/src/run_news.py \\
        --method telegram --config path/to/config.json

Requirements
------------
- DeerFlow backend dependencies must be installed (run ``make install`` first).
- A valid ``config.yaml`` with at least one LLM model configured.
- For Telegram delivery: ``TELEGRAM_BOT_TOKEN`` and ``TELEGRAM_CHAT_ID`` env vars
  (or a config.json with ``bot_token`` and ``chat_id``).
- For webhook delivery: ``WEBHOOK_URL`` env var (or ``webhook_url`` in config.json).
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

# ── Bootstrap sys.path ────────────────────────────────────────────────────
# Resolve paths relative to this script so the import works regardless of cwd.
_repo_root = Path(__file__).parents[3]
_projects_dir = _repo_root / "projects"
_backend_harness = _repo_root / "backend" / "packages" / "harness"

for _p in (_projects_dir, _backend_harness):
    _s = str(_p)
    if _s not in sys.path:
        sys.path.insert(0, _s)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(str(_repo_root / ".env"))


# ── Main ──────────────────────────────────────────────────────────────────


async def main(method: str, top_n: int, config_path: str | None) -> None:
    from langchain_core.messages import HumanMessage

    from ai_news_daily.src.graphs.ai_news_daily import make_ai_news_daily_graph

    # Load credentials from a JSON file if supplied.
    notifier_config: dict = {}
    if config_path:
        try:
            with open(config_path) as fh:
                notifier_config = json.load(fh)
        except FileNotFoundError:
            print(f"Config file not found: {config_path}")
            sys.exit(1)
        except json.JSONDecodeError as exc:
            print(f"Invalid JSON in config file: {exc}")
            sys.exit(1)

    graph = make_ai_news_daily_graph().compile()

    # Pass runtime parameters through the workflow_config key in state.
    initial_state = {
        "messages": [HumanMessage(content="Run AI news daily digest")],
        "workflow_config": {
            "top_n": top_n,
            "method": method,
            "notifier_config": notifier_config,
        },
    }

    print(f"\nStarting AI News Daily workflow (method={method}, top_n={top_n})\n")
    print("Stage 1/3 — Fetching and scoring RSS feeds …")

    final_state = await graph.ainvoke(initial_state)

    digest = final_state.get("final_output", "No digest generated.")
    print("\n" + "=" * 72)
    print(digest)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="AI News Daily — CLI runner")
    parser.add_argument(
        "--method",
        choices=["telegram", "webhook", "file"],
        default="file",
        help="Notification delivery method (default: file)",
    )
    parser.add_argument(
        "--top-n",
        type=int,
        default=3,
        metavar="N",
        help="Number of top news stories to include (default: 3)",
    )
    parser.add_argument(
        "--config",
        metavar="PATH",
        default=None,
        help="Path to a JSON file with notification credentials",
    )

    args = parser.parse_args()
    asyncio.run(main(method=args.method, top_n=args.top_n, config_path=args.config))