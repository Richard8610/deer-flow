from __future__ import annotations
from datetime import datetime
from pathlib import Path

def save_output(content: str, name: str, output_dir: Path | None = None) -> Path | None:
    try:
        if output_dir is None:
            from deerflow.config.paths import get_paths
            output_dir = get_paths().base_dir / "projects" / "travel_planner" / "outputs"
        output_dir.mkdir(parents=True, exist_ok=True)
        date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = output_dir / f"{name}_{date_str}.md"
        path.write_text(content, encoding="utf-8")
        return path
    except Exception as e:
        print(f"Error saving output: {e}")
        return None