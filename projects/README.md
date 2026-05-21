# DeerFlow Workflow Projects

This directory is managed by the **Workflow Creation Agent**. Each subdirectory is a self-contained project generated during a workflow run.

## Project Structure

Each project follows this standard layout:

```
projects/{project_name}/
├── assets/           # Prompt templates, static data, icons
├── config/           # Project configuration (YAML)
│   └── workflow.yaml
├── scripts/          # Automation and utility scripts
├── src/
│   ├── agents/       # Custom agent definitions for this project
│   ├── graphs/       # LangGraph graph definitions
│   ├── storage/      # Data persistence modules
│   ├── tools/        # Custom tool implementations
│   └── utils/        # Shared utility functions
└── README.md
```

## Creating a New Workflow Project

Use the **Workflow Agent** (registered as `project_agent` in LangGraph):

1. Start a conversation with the workflow agent
2. Describe your task or goal
3. The agent will:
   - Decompose your task into subtasks
   - Search for relevant skills and tools
   - Create and run specialized subagents
   - Evaluate the results
   - Scaffold a project directory here
4. Find your generated project in `projects/{project_name}/`

## Accessing Projects

Projects are stored under `{DEER_FLOW_HOME}/projects/` by default.

When the agent has sandbox access, projects are also accessible at:
- Sandbox path: `/mnt/user-data/workspace/projects/{project_name}/`
- Host path: `{DEER_FLOW_HOME}/threads/{thread_id}/user-data/workspace/projects/{project_name}/`