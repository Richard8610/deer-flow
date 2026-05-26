#!/usr/bin/env python3
"""CLI runner — run from repo root:
    uv run python projects/travel_planner/src/run_travel_planner.py [城市名称]
"""
from __future__ import annotations
import asyncio, sys
from pathlib import Path

_repo_root = Path(__file__).parents[3]
for p in (_repo_root / "projects", _repo_root / "backend" / "packages" / "harness"):
    if (s := str(p)) not in sys.path:
        sys.path.insert(0, s)

from dotenv import load_dotenv
load_dotenv(str(_repo_root / ".env"))


async def main() -> None:
    from travel_planner.src.graphs.travel_planner import make_travel_planner_graph
    graph = make_travel_planner_graph().compile()
    
    user_input = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else ""
    result = await graph.ainvoke({"user_input": user_input})
    
    if "error" in result:
        print(f"Error: {result['error']}")
        print("Usage: python run_travel_planner.py [城市名称]")
    else:
        print("\n" + "="*60 + "\n")
        print(result.get("final_output", "生成完成"))
        print("\n" + "="*60 + "\n")
        if "output_path" in result:
            print(f"计划已保存至: {result['output_path']}")

if __name__ == "__main__":
    asyncio.run(main())