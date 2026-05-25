"""Persist AI news digests to disk."""
from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_DEFAULT_PROJECT_DIR_NAME = "ai_news_daily"


def save_digest(message: str, date_str: str, output_dir: Path | None = None) -> Path | None:
    """Write *message* to a Markdown file and return the path.

    Parameters
    ----------
    message:
        Digest content to write.
    date_str:
        Date string used in the filename (e.g. ``"20260525"``).
    output_dir:
        Directory to write into.  Defaults to
        ``{DEER_FLOW_HOME}/projects/ai_news_daily/``.

    Returns
    -------
    Path to the saved file, or ``None`` if saving failed.
    """
    try:
        if output_dir is None:
            from deerflow.config.paths import get_paths

            output_dir = get_paths().base_dir / "projects" / _DEFAULT_PROJECT_DIR_NAME

        output_dir.mkdir(parents=True, exist_ok=True)
        filename = f"ai_news_{date_str}.md"
        path = output_dir / filename
        path.write_text(message, encoding="utf-8")
        logger.info("Digest saved to %s", path)
        return path
    except Exception:
        logger.exception("Failed to save digest")
        return None


def load_digest(path: Path) -> str | None:
    """Read a previously saved digest, returning ``None`` on error."""
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        logger.exception("Failed to read digest from %s", path)
        return None