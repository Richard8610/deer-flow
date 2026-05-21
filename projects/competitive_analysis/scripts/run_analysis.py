#!/usr/bin/env python3
"""CLI runner for the competitive analysis workflow.

Usage
-----
From the repository root::

    uv run python projects/competitive_analysis/scripts/run_analysis.py "OpenAI"
    uv run python projects/competitive_analysis/scripts/run_analysis.py "字节跳动"

The script compiles the graph, runs the full pipeline, and prints the
Markdown report. The report is also saved to disk by ``save_report_node``.

Requirements
------------
- DeerFlow backend dependencies must be installed (run ``make install`` first).
- A valid ``config.yaml`` with at least one LLM and web-search tools configured.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Make the projects/ directory importable so relative imports inside the
# competitive_analysis package resolve correctly.
_repo_root = Path(__file__).parents[3]
_projects_dir = _repo_root / "projects"
_backend_harness = _repo_root / "backend" / "packages" / "harness"

for p in (_projects_dir, _backend_harness):
    s = str(p)
    if s not in sys.path:
        sys.path.insert(0, s)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(str(_repo_root / ".env"))


async def main(company: str) -> None:
    from langchain_core.messages import HumanMessage

    from competitive_analysis.src.graphs.competitive_analysis import make_competitive_analysis_graph

    graph = make_competitive_analysis_graph().compile()
    state = {"messages": [HumanMessage(content=company)]}

    print(f"\n🔍  Starting competitive analysis for: {company}\n")
    print("Stage 1/4 — Extracting company name …")

    final_state = await graph.ainvoke(state)

    report = final_state.get("final_output", "No report generated.")
    print("\n" + "=" * 72)
    print(report)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_analysis.py <company_name>")
        print('Example: python run_analysis.py "OpenAI"')
        sys.exit(1)

    company_input = " ".join(sys.argv[1:])
    asyncio.run(main(company_input))