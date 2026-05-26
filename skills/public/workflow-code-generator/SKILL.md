---
name: workflow-code-generator
description: >-
  Generate complete, runnable Python code for a DeerFlow workflow project from
  a natural-language description. Produces the full project scaffold:
  StateGraph, node functions, utility modules, CLI runner, config, and the
  workflow.json visual definition consumed by the Workflow Builder frontend.
  Trigger when asked to "build", "create", "implement", or "code" a workflow,
  automation, pipeline, or agent.
allowed-tools:
  - bash
  - read_file
  - write_file
  - str_replace
---

# Workflow Code Generator

Generate a complete, runnable DeerFlow workflow project from a plain-English description.

## What you will produce

For a workflow named `{project_name}`, write every file in this structure:

```
projects/{project_name}/
├── __init__.py
├── README.md
├── workflow.json                        ← visual graph for Workflow Builder
├── assets/
│   ├── prompts/                         ← search-query or prompt references
│   └── templates/                       ← output format templates
├── config/
│   └── workflow.yaml                    ← runtime settings (timeouts, params)
├── scripts/
│   └── run_{project_name}.py            ← CLI entry point
└── src/
    ├── __init__.py
    ├── state.py                         ← re-exports WorkflowState
    ├── graphs/
    │   ├── __init__.py
    │   └── {project_name}.py            ← StateGraph (source of truth)
    ├── storage/
    │   ├── __init__.py
    │   └── {output}_store.py            ← save results to disk
    ├── tools/
    │   └── __init__.py
    └── utils/
        ├── __init__.py
        └── *.py                         ← domain logic helpers
```

All files are written under the **sandbox workspace** path:
`/mnt/user-data/workspace/{project_name}/`

Then copy or symlink the finished project to `projects/{project_name}/` so the Workflow Builder frontend can load it.

---

## Step-by-step generation process

### Step 1 — Understand the workflow

Before writing a single line of code, answer these questions from the user's description:

- **What is the input?** (user message, file, schedule trigger, API call, …)
- **What are the main processing steps?** (fetch data, call LLM, transform, evaluate, …)
- **Are any steps parallel?** (research branches, multi-source aggregation, …)
- **What is the output?** (file, notification, API call, structured report, …)
- **What delivery or side-effect is needed?** (save to disk, send via Telegram, push to API, …)

Map each answer to a node in the StateGraph.

### Step 2 — Design the StateGraph

Identify nodes and their types:

| Node type | Use when |
|-----------|----------|
| `start` / `end` | Entry and terminal nodes |
| **fetch / collect** | Pull data from external sources (RSS, API, DB) |
| **process / transform** | Pure data transformation, scoring, filtering |
| **llm** | Call the LLM to generate, summarize, or format text |
| **condition** | Branch on a runtime value (e.g. delivery method) |
| **subagent** | Delegate a complex research or code task |
| **save / notify** | Write output to disk or send a notification |

Edges: connect nodes in execution order. Condition nodes have two outgoing edges labeled `true` and `false`.

### Step 3 — Write `src/graphs/{project_name}.py`

Follow this exact pattern (from `competitive_analysis`):

```python
"""One-line description of the graph."""
from __future__ import annotations
import logging
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph

logger = logging.getLogger(__name__)


def _get_state_class():
    from ..state import WorkflowState
    return WorkflowState


# ── Node functions ─────────────────────────────────────────────────────────

async def node_one(state, config: RunnableConfig) -> dict:
    """Short docstring."""
    # … implementation …
    return {"some_state_key": result}


async def node_two(state, config: RunnableConfig) -> dict:
    from deerflow.config import get_app_config
    from deerflow.models import create_chat_model
    model = create_chat_model(thinking_enabled=False, app_config=get_app_config())
    response = await model.ainvoke([HumanMessage(content="...")])
    return {"final_output": response.content}


# ── Graph factory ──────────────────────────────────────────────────────────

def make_{project_name}_graph() -> StateGraph:
    WorkflowState = _get_state_class()
    builder = StateGraph(WorkflowState)

    builder.add_node("node_one", node_one)
    builder.add_node("node_two", node_two)

    builder.add_edge(START, "node_one")
    builder.add_edge("node_one", "node_two")
    builder.add_edge("node_two", END)

    return builder
```

**Rules:**
- Every node is `async def`.
- Every node returns a `dict` with only the keys it updates in `WorkflowState`.
- The factory returns an **uncompiled** `StateGraph` — callers call `.compile()`.
- Imports inside node functions avoid circular-import issues at module load time.

### Step 4 — Write `src/state.py`

Always this exact content — re-export from the harness:

```python
"""Re-exports canonical WorkflowState from the harness."""
from deerflow.agents.project_agent.state import WorkflowState  # noqa: F401

__all__ = ["WorkflowState"]
```

### Step 5 — Write utility modules in `src/utils/`

Extract domain logic (data fetching, scoring, formatting, notification) into small, focused modules.  
Keep nodes thin — they call utils, they don't implement logic directly.

Example for an RSS workflow:
- `src/utils/rss_collector.py` — `get_top_news(top_n) -> list[dict]`, `format_message(items) -> str`
- `src/utils/notifier.py` — `send(message, method, config) -> bool`

### Step 6 — Write `src/storage/{output}_store.py`

Pattern from `competitive_analysis`:

```python
from __future__ import annotations
from datetime import datetime
from pathlib import Path

def save_output(content: str, name: str, output_dir: Path | None = None) -> Path | None:
    try:
        if output_dir is None:
            from deerflow.config.paths import get_paths
            output_dir = get_paths().base_dir / "projects" / "{project_name}"
        output_dir.mkdir(parents=True, exist_ok=True)
        date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = output_dir / f"{name}_{date_str}.md"
        path.write_text(content, encoding="utf-8")
        return path
    except Exception:
        return None
```

### Step 7 — Write `scripts/run_{project_name}.py`

CLI runner pattern from `competitive_analysis`:

```python
#!/usr/bin/env python3
"""CLI runner — run from repo root:
    uv run python projects/{project_name}/src/run_{project_name}.py [args]
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
    from {project_name}.src.graphs.{project_name} import make_{project_name}_graph
    graph = make_{project_name}_graph().compile()
    result = await graph.ainvoke({})
    print(result.get("final_output", "Done."))

if __name__ == "__main__":
    asyncio.run(main())
```

### Step 8 — Write `workflow.json`

This file powers the **Workflow Builder** visual frontend. Each node in your StateGraph becomes a visual node here.

**Node types** map to React Flow component types:

| `nodeKind` | `type` (rfType) | Use for |
|------------|-----------------|---------|
| `start` | `io` | Entry trigger |
| `end` | `io` | Terminal output |
| `tool` | `process` | Data fetch, API call, file write |
| `llm` | `process` | LLM call / text generation |
| `subagent` | `process` | Delegate to subagent |
| `condition` | `condition` | Branch (true/false outputs) |

**Full schema:**

```json
{
  "nodes": [
    {
      "id": "start",
      "type": "io",
      "position": { "x": 40, "y": 200 },
      "data": {
        "nodeKind": "start",
        "label": "Trigger",
        "description": "Entry point description"
      }
    },
    {
      "id": "fetch",
      "type": "process",
      "position": { "x": 280, "y": 200 },
      "data": {
        "nodeKind": "tool",
        "label": "Fetch Data",
        "description": "What this node does",
        "toolName": "function_name",
        "outputFields": ["items[]"]
      }
    },
    {
      "id": "format",
      "type": "process",
      "position": { "x": 520, "y": 200 },
      "data": {
        "nodeKind": "llm",
        "label": "Format Output",
        "description": "LLM formats the result",
        "model": "default",
        "prompt": "Format: {{items}}",
        "inputFields": ["items[]"],
        "outputFields": ["output"]
      }
    },
    {
      "id": "branch",
      "type": "condition",
      "position": { "x": 760, "y": 200 },
      "data": {
        "nodeKind": "condition",
        "label": "Route?",
        "description": "Branch condition description",
        "inputFields": ["method"]
      }
    },
    {
      "id": "end",
      "type": "io",
      "position": { "x": 1000, "y": 200 },
      "data": {
        "nodeKind": "end",
        "label": "Done",
        "description": "Final output delivered"
      }
    }
  ],
  "edges": [
    { "id": "e1", "source": "start",  "target": "fetch",  "type": "dataflow", "animated": true },
    { "id": "e2", "source": "fetch",  "target": "format", "type": "dataflow", "animated": true },
    { "id": "e3", "source": "format", "target": "branch", "type": "dataflow", "animated": true },
    { "id": "e4", "source": "branch", "target": "end",    "type": "dataflow", "animated": true,
      "sourceHandle": "true", "label": "yes" },
    { "id": "e5", "source": "branch", "target": "end",    "type": "dataflow", "animated": true,
      "sourceHandle": "false", "label": "no" }
  ]
}
```

**Layout rules:**
- Space nodes ~240px apart horizontally.
- Parallel branches split vertically (upper branch y-80, lower branch y+80 from the condition node).
- `type` on edges must be `"dataflow"` with `"animated": true`.
- Condition node outgoing edges must set `"sourceHandle": "true"` or `"sourceHandle": "false"`.

### Step 9 — Write `config/workflow.yaml`

```yaml
project_name: {project_name}
version: "1.0.0"
description: "One-line description"

# Runtime parameters
workflow:
  timeout_seconds: 300

# Domain-specific settings
# e.g. feeds, top_n, model_name, output paths
```

### Step 10 — Write `README.md`

```markdown
# {Project Name}

> One-line description.

## Project Structure

\`\`\`
{project_name}/
├── assets/
├── config/workflow.yaml
├── scripts/run_{project_name}.py
├── src/graphs/{project_name}.py
└── workflow.json
\`\`\`

## Workflow

\`\`\`
Start → Node A → Node B → … → End
\`\`\`

## Usage

\`\`\`bash
uv run python projects/{project_name}/scripts/run_{project_name}.py
\`\`\`

## Configuration

Edit \`config/workflow.yaml\` to adjust parameters.

## Prerequisites

- DeerFlow backend installed (\`make install\`)
- \`config.yaml\` with at least one LLM model configured
```

---

## Quality checklist

Before declaring the project complete, verify:

- [ ] All `async def` node functions return a `dict`
- [ ] `make_{project_name}_graph()` returns an **uncompiled** `StateGraph`
- [ ] `workflow.json` has valid JSON, every node has `id`, `type`, `position`, `data.nodeKind`, `data.label`
- [ ] Condition node edges have `sourceHandle: "true"` and `sourceHandle: "false"`
- [ ] `src/state.py` re-exports `WorkflowState` from the harness
- [ ] `scripts/run_{project_name}.py` bootstraps `sys.path` correctly
- [ ] `config/workflow.yaml` has `project_name` and `version`
- [ ] `README.md` exists with usage instructions
- [ ] All `__init__.py` files are present in `src/`, `src/graphs/`, `src/storage/`, `src/utils/`, `src/tools/`