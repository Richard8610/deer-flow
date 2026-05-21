"""General-purpose StateGraph factory that discovers project graphs from projects/.

``load_project_graph(name)`` probes (in order):
  1. ``<name>.src.graphs.<name>``          → ``make_<name>_graph()`` / ``make_graph()``
  2. ``<name>.src.graphs.workflow_graph``  → ``make_workflow_graph()``
  3. ``<name>.src.agent``                  → ``make_<name>_agent()`` / ``make_agent()``

Returns a zero-argument callable that returns a ``StateGraph`` builder, or ``None``
when the project folder is absent / has no recognised factory.  Callers call
``.compile()`` on the returned builder.

The built-in ``make_workflow_graph()`` is always available as a fallback.
"""
from __future__ import annotations

import importlib
import logging
from typing import Callable

from langgraph.graph import StateGraph

logger = logging.getLogger(__name__)


def load_project_graph(project_name: str) -> Callable[[], StateGraph] | None:
    """Return a zero-arg graph-builder for *project_name*, or ``None`` if not found.

    Naming convention for the project package: ``<project_name>.src.*``
    where *project_name* uses underscores (hyphens and spaces are normalised).
    """
    snake = project_name.replace("-", "_").replace(" ", "_").lower()

    # Probe list: (module dotted path, [function names to try in order])
    probes: list[tuple[str, list[str]]] = [
        (f"{snake}.src.graphs.{snake}", [f"make_{snake}_graph", "make_graph"]),
        (f"{snake}.src.graphs.workflow_graph", ["make_workflow_graph"]),
        (f"{snake}.src.agent", [f"make_{snake}_agent", "make_agent"]),
    ]

    for module_path, func_names in probes:
        try:
            mod = importlib.import_module(module_path)
        except ImportError:
            continue
        for fname in func_names:
            fn = getattr(mod, fname, None)
            if fn is not None:
                logger.debug("Resolved graph factory: %s.%s", module_path, fname)
                return fn

    logger.debug("No project graph found for '%s'", project_name)
    return None


def list_projects() -> list[str]:
    """Return names of project packages currently on sys.path."""
    import sys
    from pathlib import Path

    results: list[str] = []
    for base in sys.path:
        p = Path(base)
        if not p.is_dir():
            continue
        for child in sorted(p.iterdir()):
            if child.is_dir() and (child / "src").is_dir() and child.name not in results:
                results.append(child.name)
    return results


def make_workflow_graph() -> StateGraph:
    """Generic task-decompose → execute → evaluate → synthesize graph (built-in fallback)."""
    from competitive_analysis.src.graphs.workflow_graph import make_workflow_graph as _impl

    return _impl()


def make_competitive_analysis_graph() -> StateGraph:
    """Convenience wrapper for the competitive analysis graph."""
    from competitive_analysis.src.graphs.competitive_analysis import make_competitive_analysis_graph as _impl

    return _impl()