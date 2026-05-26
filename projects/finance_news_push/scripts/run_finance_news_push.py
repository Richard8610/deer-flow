#!/usr/bin/env python3
"""CLI runner — run from repo root:
    uv run python projects/finance_news_push/scripts/run_finance_news_push.py [args]
"""
from __future__ import annotations
import asyncio
import sys
from pathlib import Path

# Add current workspace to sys.path
workspace_dir = Path(__file__).parents[2]  # /.../finance_news_push
_repo_root = workspace_dir.parent
if str(workspace_dir) not in sys.path:
    sys.path.insert(0, str(workspace_dir))
if str(_repo_root) not in sys.path:
    sys.path.insert(0, str(_repo_root))

for p in (_repo_root / "projects", _repo_root / "backend" / "packages" / "harness"):
    if (s := str(p)) not in sys.path:
        sys.path.insert(0, s)

from dotenv import load_dotenv
load_dotenv(str(_repo_root / ".env"))


async def main() -> None:
    from finance_news_push.src.graphs.finance_news_push import make_finance_news_push_graph
    graph = make_finance_news_push_graph().compile()
    result = await graph.ainvoke({})
    print(result.get("final_output", "Done."))

if __name__ == "__main__":
    asyncio.run(main())