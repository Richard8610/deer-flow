"""Persist and retrieve competitive analysis reports."""
from __future__ import annotations

import logging
import re
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

_DEFAULT_OUTPUT_DIR_NAME = "competitive_analysis"


def _safe_name(company: str, max_len: int = 50) -> str:
    """Return a filesystem-safe version of the company name."""
    return re.sub(r"[^\w一-鿿-]", "_", company)[:max_len]


def save_report(report: str, company: str, output_dir: Path | None = None) -> Path | None:
    """Write *report* to a Markdown file and return the path.

    Parameters
    ----------
    report:
        Markdown report content.
    company:
        Company name used to build the filename.
    output_dir:
        Directory to write into.  Defaults to
        ``{DEER_FLOW_HOME}/projects/competitive_analysis/``.

    Returns
    -------
    Path to the saved file, or ``None`` if saving failed.
    """
    try:
        if output_dir is None:
            from deerflow.config.paths import get_paths

            output_dir = get_paths().base_dir / "projects" / _DEFAULT_OUTPUT_DIR_NAME

        output_dir.mkdir(parents=True, exist_ok=True)
        date_str = datetime.now().strftime("%Y%m%d")
        filename = f"{_safe_name(company)}_{date_str}_竞品分析.md"
        path = output_dir / filename
        path.write_text(report, encoding="utf-8")
        logger.info("Report saved to %s", path)
        return path
    except Exception:
        logger.exception("Failed to save report")
        return None


def load_report(path: Path) -> str | None:
    """Read a previously saved report, returning ``None`` on error."""
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        logger.exception("Failed to read report from %s", path)
        return None