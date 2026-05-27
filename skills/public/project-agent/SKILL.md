---
name: project-agent
description: Execute complex multi-step projects by decomposing them into parallel subagent tasks. Use when the user asks to build, implement, research, or automate something requiring multiple steps. Follows a decompose → plan → execute → evaluate → synthesize pipeline.
allowed-tools:
  - bash
  - read_file
  - write_file
  - str_replace
  - web_search
  - web_fetch
---

# Project Agent Skill

## Overview

This skill turns a high-level user request into a fully executed, multi-step project. It orchestrates parallel subagent tasks using the `task` tool, evaluates their results, retries failures, and synthesises everything into a final deliverable.

## When to Use

- User wants to **build** or **implement** a workflow, pipeline, agent, or automation
- User wants to **research** a topic and produce a structured report
- User requests involve **multiple independent steps** that can run in parallel
- User says: "create a project for…", "automate…", "build a system that…", "execute a plan for…"

## Pipeline

### Phase 1 — Parse & Scaffold

1. Extract the core task description from the user's message.
2. Derive a `project_name` in `snake_case` (e.g. `"ai_news_daily"`).
3. Create the project directory scaffold:

```
projects/{project_name}/
├── __init__.py
├── README.md
├── workflow.json          ← seed visual graph (start → end nodes)
├── assets/
├── config/
│   └── workflow.yaml
└── src/
    ├── __init__.py
    ├── agents/
    ├── graphs/
    ├── storage/
    ├── tools/
    └── utils/
```

Use `bash` to create directories and `write_file` to seed `README.md`, `config/workflow.yaml`, and a minimal `workflow.json`.

Seed `workflow.json`:
```json
{
  "nodes": [
    {"id": "start", "type": "io", "position": {"x": 80,  "y": 200}, "data": {"nodeKind": "start", "label": "Start", "description": "Entry point"}},
    {"id": "end",   "type": "io", "position": {"x": 400, "y": 200}, "data": {"nodeKind": "end",   "label": "End",   "description": "Final output"}}
  ],
  "edges": [
    {"id": "e1", "source": "start", "target": "end", "type": "dataflow", "animated": true}
  ]
}
```

### Phase 2 — Decompose

Break the task into **2–5 focused subtasks**, each independently executable with no shared context:

```json
[
  {
    "id": "1",
    "description": "Clear description of what this subtask does",
    "required_tools": ["web_search", "write_file"],
    "subagent_type": "general-purpose",
    "priority": 1
  }
]
```

Rules:
- Each subtask must be **self-contained** — the subagent has no context about other subtasks.
- Prefer `subagent_type: "general-purpose"` for research/writing; `"bash"` for pure shell work.
- For any subtask that generates workflow code, reference the `workflow-code-generator` skill.
- Aim for parallelism: independent tasks should have the same `priority`.

### Phase 3 — Plan Assignments

For each subtask, write a **self-contained prompt** that:
- States exactly what to do and what output format is expected.
- Specifies output paths under `projects/{project_name}/` or `/mnt/user-data/outputs/`.
- For code-generation tasks: starts with `"Read /mnt/skills/public/workflow-code-generator/SKILL.md for the full code-generation specification."` and ends with `"Follow all steps in the skill, produce every file, and verify the quality checklist at the end."`.
- References the expected output of prerequisite tasks when there are dependencies.

### Phase 4 — Execute in Parallel

Launch **all assignments simultaneously** using the `task` tool. Do not wait for one to finish before starting the next.

For each assignment:
```
Description: {subtask description}
Subagent type: {subagent_type}
Prompt: {self-contained prompt from Phase 3}
```

Poll until every subagent completes (check status; terminal states are `completed`, `failed`, `timed_out`).

### Phase 5 — Evaluate

For each result, assess:
- `passed`: true if the result adequately addresses the subtask objective (score ≥ 0.7).
- `score`: 0.0–1.0.
- `feedback`: specific, constructive feedback.

If any subtask failed, **retry it once** with an improved prompt that incorporates the failure feedback.

### Phase 6 — Synthesize

Produce a concise final response covering:
1. **What was accomplished** — summary of the project.
2. **Key outputs and deliverables** — list every file created with its path.
3. **Issues or limitations** — anything that didn't go as planned.
4. **Recommended next steps** — what the user should do now.

Always mention the `projects/{project_name}/` directory so the user can open it in the Workflow Builder (select it in the project dropdown).

## Quality Standards

- Every subtask prompt must be fully self-contained — no references like "as discussed" or "as above".
- File paths must be absolute or relative to a clearly stated base.
- Do not fabricate research results; use `web_search` and `web_fetch` for factual claims.
- Minimum 2 subtasks — never collapse a multi-step project into a single task.
- The project directory scaffold is mandatory for any build/implement request.

## Example Decomposition

**User:** "Build a daily finance news aggregator that sends a digest email"

**Subtasks:**
1. `research` — Research finance news APIs (NewsAPI, Alpha Vantage) and email services (SendGrid, SMTP). Write findings to `projects/finance_news_push/assets/research.md`.
2. `code` — Generate complete Python project code using the workflow-code-generator skill. Project: `finance_news_push`. Reads from `projects/finance_news_push/assets/research.md`.
3. `config` — Write `projects/finance_news_push/config/workflow.yaml` with API keys placeholders and schedule config.

**Parallel execution:** tasks 1 and 3 run simultaneously; task 2 starts after task 1 completes (depends on research output).
