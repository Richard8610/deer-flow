# Generate Workflow Frontend

Scaffold a self-contained React + Vite interactive workflow-builder frontend at `$ARGUMENTS` (default: `workflow_frontend`).

The frontend visualises LangGraph-style DAGs with drag-and-drop node creation, a property inspector, JSON import/export, live persistence to `./projects/{name}/workflow.json` via a lightweight FastAPI server, and a full-page **Agent Chat** at `/chat` that streams from the DeerFlow project_agent. It is project-agnostic: **the only file a new project edits is `src/workflow.config.ts`**.

Stack: **@xyflow/react v12**, **Zustand v5**, **react-router-dom v7**, React 18, Vite 6 (frontend) + **FastAPI + uvicorn + httpx** (persistence + chat proxy server, port 8002).

## Instructions

1. Determine the target directory: use `$ARGUMENTS` if provided, otherwise `workflow_frontend`.
2. Create every file listed under **Files to create** exactly as shown.
3. After writing all files, run `npm install --cache /tmp/npm-cache` inside the target directory, then `npm run build` to verify zero TypeScript errors.
4. Verify Python deps: `pip install fastapi uvicorn httpx`.
5. Tell the user how to start both servers (see **Running** below).

---

## Running

Two processes are needed. Start them in separate terminals from inside the target directory:

```bash
# Terminal 1 — persistence + chat proxy server
uvicorn server.main:app --port 8002 --reload

# Terminal 2 — Vite dev server
npm run dev
```

Open **http://localhost:5173** for the workflow builder and **http://localhost:5173/chat** for the agent chat page.

**Gateway auth** (for chat): the persistence server auto-logins to the DeerFlow gateway via env vars:

```bash
export DEERFLOW_URL=http://localhost:8001      # default
export DEERFLOW_EMAIL=admin@deerflow.ai        # default
export DEERFLOW_PASSWORD=admin                  # default
```

---

## Customisation guide

Edit **only** `src/workflow.config.ts`:

| Section | What to change |
|---|---|
| `APP` | Title, logo emoji, subtitle, GitHub URL |
| `NODE_KINDS` | Add/remove/reorder node types; set colors, icons, `rfType`, `handles`, `inspectorFields` |
| `EXAMPLES` | Swap in your own `{ nodes, edges }` datasets; remove to hide the section |

Everything else — Canvas, Inspector, Sidebar, store, persistence, chat — auto-derives from the config.

### Adding a new node kind

```ts
// in src/workflow.config.ts → NODE_KINDS array:
{
  kind: 'api_call',
  color: '#6D28D9',
  icon: '🌐',
  label: 'API Call',
  rfType: 'process',          // 'io' | 'process' | 'condition'
  desc: 'Call an external REST endpoint',
  inspectorFields: [
    { key: 'endpoint', label: 'Endpoint URL', type: 'text' },
    { key: 'method',   label: 'HTTP Method',  type: 'select', options: ['GET','POST','PUT','DELETE'], default: 'POST' },
  ],
},
```

### Persistence behaviour

- The topbar shows a project dropdown listing every directory under `./projects/` that contains a `src/` subfolder.
- Selecting a project loads its `workflow.json` onto the canvas (empty canvas if none saved yet).
- Any canvas edit auto-saves after a 1-second debounce; the topbar shows `↑ saving…` / `✓ saved` / `✗ save failed`.
- Selecting **— local only —** disables persistence; changes stay in-browser only.
- The frontend gracefully degrades when the persistence server is not running (project dropdown simply does not appear).

### Chat page and agent sidebar

The builder topbar has two chat entry points:

| Button | Behaviour |
|---|---|
| **💬 Chat** | Navigates to `/chat` — a full-page chat experience |
| **🤖 Agent** | Toggles an inline `ChatPanel` sidebar (green when open) alongside the canvas |

Both pass the active project name so the right agent is selected.  
On `/chat`: when the agent replies with a fenced JSON block containing `nodes` + `edges`, an **"↙ Open in Builder"** button appears in the topbar that encodes the workflow as `?workflow=<base64>` and loads it onto the canvas.  
On the inline sidebar: the **"↙ Load to canvas"** banner loads the workflow directly without leaving the builder.

### Loading a workflow from a URL

```
http://localhost:5173/?workflow=https://api.example.com/my-workflow.json
```

Or encode any workflow JSON as base64 and use `?workflow=<base64>` for a self-contained shareable link.

---

## Files to create

### `package.json`

```json
{
  "name": "workflow-frontend",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@xyflow/react": "^12.3.6",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^7.15.1",
    "zustand": "^5.0.3"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.2",
    "vite": "^6.0.6"
  }
}
```

### `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/workflow': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
      '/api/chat': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
    },
  },
});
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

### `index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Workflow Builder</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### `server/__init__.py`

```python
```

### `server/requirements.txt`

```
fastapi>=0.115
uvicorn[standard]>=0.30
httpx>=0.27
```

### `server/main.py`

```python
"""
Workflow persistence + chat proxy server.

Run from workflow_frontend/:
    uvicorn server.main:app --port 8002 --reload

Environment variables:
    DEERFLOW_URL       DeerFlow gateway base URL (default: http://localhost:8001)
    DEERFLOW_EMAIL     Login email for gateway auth  (default: admin@deerflow.ai)
    DEERFLOW_PASSWORD  Login password                (default: admin)

Reads / writes  ./projects/{name}/workflow.json  relative to the repo root.
"""

import os
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

PROJECTS_DIR = (Path(__file__).parent.parent.parent / "projects").resolve()
WORKFLOW_FILE = "workflow.json"

GW_BASE = os.getenv("DEERFLOW_URL", "http://localhost:8001")
GW_EMAIL = os.getenv("DEERFLOW_EMAIL", "admin@deerflow.ai")
GW_PASSWORD = os.getenv("DEERFLOW_PASSWORD", "admin")

app = FastAPI(title="Workflow Dev Server", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "PUT", "POST"],
    allow_headers=["*"],
)

# ── Gateway client (shared, persists cookies) ──────────────────────────────

_gw_client: httpx.AsyncClient | None = None


async def _gateway() -> httpx.AsyncClient:
    """Return an authenticated httpx client for the DeerFlow gateway."""
    global _gw_client
    if _gw_client is not None:
        return _gw_client

    _gw_client = httpx.AsyncClient(follow_redirects=True, timeout=300.0)
    try:
        r = await _gw_client.post(
            f"{GW_BASE}/api/v1/auth/login/local",
            json={"email": GW_EMAIL, "password": GW_PASSWORD},
        )
        r.raise_for_status()
        print(f"[chat] authenticated with gateway as {GW_EMAIL}")
    except Exception as exc:
        print(f"[chat] warning — gateway auth failed: {exc}")
    return _gw_client


# ── Workflow persistence ────────────────────────────────────────────────────


def _project_path(name: str) -> Path:
    resolved = (PROJECTS_DIR / name).resolve()
    if not resolved.is_relative_to(PROJECTS_DIR):
        raise HTTPException(status_code=400, detail="Invalid project name")
    if not resolved.is_dir():
        raise HTTPException(status_code=404, detail=f"Project '{name}' not found")
    return resolved


@app.get("/api/workflow/projects")
def list_projects() -> dict[str, list[str]]:
    if not PROJECTS_DIR.exists():
        return {"projects": []}
    names = sorted(
        d.name
        for d in PROJECTS_DIR.iterdir()
        if d.is_dir() and not d.name.startswith(".") and (d / "src").is_dir()
    )
    return {"projects": names}


@app.get("/api/workflow/projects/{name}")
def get_workflow(name: str) -> dict[str, Any]:
    project = _project_path(name)
    wf_file = project / WORKFLOW_FILE
    if wf_file.exists():
        import json
        return json.loads(wf_file.read_text(encoding="utf-8"))
    return {"nodes": [], "edges": []}


@app.put("/api/workflow/projects/{name}")
def save_workflow(name: str, body: dict[str, Any]) -> dict[str, Any]:
    import json
    project = _project_path(name)
    wf_file = project / WORKFLOW_FILE
    wf_file.write_text(json.dumps(body, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"ok": True, "path": str(wf_file.relative_to(PROJECTS_DIR.parent))}


# ── Chat proxy ─────────────────────────────────────────────────────────────


@app.post("/api/chat/stream")
async def chat_stream(body: dict[str, Any]) -> StreamingResponse:
    """
    Proxy a streaming chat request to the DeerFlow project_agent.

    Body:
      messages: [{"role": "user"|"assistant", "content": "..."}]
      project:  optional project name — used to select the agent
                (e.g. "competitive_analysis" → "competitive_analysis_agent")
    """
    messages: list[dict] = body.get("messages", [])
    project: str = body.get("project", "")
    assistant_id = f"{project}_agent" if project else "project_agent"

    client = await _gateway()

    async def _stream():
        try:
            async with client.stream(
                "POST",
                f"{GW_BASE}/api/runs/stream",
                json={
                    "assistant_id": assistant_id,
                    "input": {"messages": messages},
                    "stream_mode": ["messages-tuple"],
                    "on_completion": "delete",
                },
            ) as resp:
                async for chunk in resp.aiter_bytes():
                    yield chunk
        except Exception as exc:
            import json as _json
            yield f"event: error\ndata: {_json.dumps(str(exc))}\n\n".encode()

    return StreamingResponse(_stream(), media_type="text/event-stream")
```

### `src/types.ts`

```ts
/** Open-ended — define your kinds in workflow.config.ts */
export type NodeKind = string;

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  nodeKind: NodeKind;
  description?: string;
  // Common scalar fields referenced by built-in inspectorFields
  model?: string;
  prompt?: string;
  subagentType?: string;
  timeoutSeconds?: number;
  toolName?: string;
  // Data-flow annotations shown as chips on nodes
  inputFields?: string[];
  outputFields?: string[];
}
```

### `src/api.ts`

```ts
const BASE = '/api/workflow';

// ── Chat streaming ──────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Stream a chat turn to the project_agent via the persistence server.
 * Calls `onChunk` for each AI text fragment, `onError` on failure.
 */
export async function streamChat(
  messages: ChatMessage[],
  project: string,
  onChunk: (text: string) => void,
  onError: (msg: string) => void,
): Promise<void> {
  const resp = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, project }),
  });
  if (!resp.ok) {
    onError(`Server error: HTTP ${resp.status}`);
    return;
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  const processBlock = (block: string) => {
    let event = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        const raw = line.slice(5).trim();
        if (raw === 'null' || raw === '') continue;

        if (event === 'error') {
          try { onError(JSON.parse(raw) as string); } catch { onError(raw); }
          return;
        }

        if (event === 'messages-tuple') {
          try {
            const [chunk] = JSON.parse(raw) as [{ content: unknown; type: string }];
            if (chunk.type === 'AIMessageChunk' && typeof chunk.content === 'string' && chunk.content) {
              onChunk(chunk.content);
            }
          } catch { /* malformed chunk — ignore */ }
        }
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const blocks = buf.split('\n\n');
    buf = blocks.pop() ?? '';
    for (const block of blocks) processBlock(block);
  }
  if (buf) processBlock(buf);
}

// ── Persistence ─────────────────────────────────────────────────────────────

export interface WorkflowData {
  nodes: unknown[];
  edges: unknown[];
}

export async function fetchProjects(): Promise<string[]> {
  const r = await fetch(`${BASE}/projects`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = (await r.json()) as { projects: string[] };
  return data.projects;
}

export async function fetchWorkflow(project: string): Promise<WorkflowData> {
  const r = await fetch(`${BASE}/projects/${encodeURIComponent(project)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<WorkflowData>;
}

export async function saveWorkflow(project: string, data: WorkflowData): Promise<void> {
  const r = await fetch(`${BASE}/projects/${encodeURIComponent(project)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}
```

### `src/workflow.config.ts`  ← **THE file to customise**

```ts
/**
 * workflow.config.ts — THE file to edit when adapting this template to a new project.
 *
 * Change APP, NODE_KINDS, and EXAMPLES.  Everything else (canvas, inspector,
 * sidebar, edges, store, persistence, chat) derives from these definitions automatically.
 */

import type { Node, Edge } from '@xyflow/react';
import { competitiveAnalysisExample, genericWorkflowExample } from './data/examples';
import type { WorkflowNodeData } from './types';

// ── App branding ───────────────────────────────────────────────────────────

export const APP = {
  title: 'Workflow Builder',
  logo: '⚡',
  subtitle: 'Workflow Visualizer',
  /** Set to a URL string to show a "GitHub ↗" link in the topbar. */
  githubUrl: 'https://github.com/bytedance/deer-flow',
};

// ── Node kind system ───────────────────────────────────────────────────────

/** A single inspector control rendered for a specific node kind. */
export interface NodeKindField {
  /** Key in WorkflowNodeData to read/write (scalar fields only). */
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select';
  rows?: number;
  options?: string[];
  default?: string | number;
}

export interface NodeKindDef {
  kind: string;
  color: string;
  icon: string;
  label: string;
  /**
   * React Flow node component to use:
   *   'io'        — entry or terminal node (controlled by `handles`)
   *   'process'   — target on left, source on right
   *   'condition' — target on left, two sources (true/false) on right
   */
  rfType: 'io' | 'process' | 'condition';
  /**
   * Which handles to render for 'io' nodes.
   * 'source-only' → entry node (no incoming edges)
   * 'target-only' → terminal node (no outgoing edges)
   * Ignored for 'process' and 'condition'.
   */
  handles?: 'source-only' | 'target-only';
  /** Short description shown in the sidebar palette. */
  desc: string;
  /** Extra fields rendered in the Inspector panel for this node kind. */
  inspectorFields?: NodeKindField[];
}

export const NODE_KINDS: NodeKindDef[] = [
  {
    kind: 'start', color: '#7C3AED', icon: '▶', label: 'Start',
    rfType: 'io', handles: 'source-only',
    desc: 'Entry point for user input',
  },
  {
    kind: 'end', color: '#059669', icon: '⏹', label: 'End',
    rfType: 'io', handles: 'target-only',
    desc: 'Final output of the workflow',
  },
  {
    kind: 'llm', color: '#2563EB', icon: '🧠', label: 'LLM',
    rfType: 'process',
    desc: 'Call a language model with a prompt',
    inspectorFields: [
      { key: 'model',  label: 'Model',          type: 'text',     default: 'default' },
      { key: 'prompt', label: 'Prompt Template', type: 'textarea', rows: 7 },
    ],
  },
  {
    kind: 'subagent', color: '#D97706', icon: '🤖', label: 'Subagent',
    rfType: 'process',
    desc: 'Delegate a task to a subagent',
    inspectorFields: [
      { key: 'subagentType',   label: 'Subagent Type', type: 'select', options: ['general-purpose', 'bash', 'ca-researcher'], default: 'general-purpose' },
      { key: 'timeoutSeconds', label: 'Timeout (sec)', type: 'number', default: 300 },
    ],
  },
  {
    kind: 'tool', color: '#0891B2', icon: '🔧', label: 'Tool',
    rfType: 'process',
    desc: 'Execute a tool or function',
    inspectorFields: [
      { key: 'toolName', label: 'Tool Name', type: 'text' },
    ],
  },
  {
    kind: 'condition', color: '#DC2626', icon: '◆', label: 'Condition',
    rfType: 'condition',
    desc: 'Branch on a runtime condition',
  },
];

const _fallback: Omit<NodeKindDef, 'kind'> = {
  color: '#64748B', icon: '❓', label: 'Node', rfType: 'process', desc: '',
};

/** Returns the NodeKindDef for `kind`, or a generic fallback for unknown kinds. */
export function getNodeKindDef(kind: string): NodeKindDef {
  return NODE_KINDS.find((d) => d.kind === kind) ?? { ..._fallback, kind, label: kind };
}

// ── Built-in example workflows ─────────────────────────────────────────────

export interface ExampleWorkflow {
  label: string;
  icon: string;
  data: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] };
}

/**
 * Add, remove, or reorder entries here to change the Examples section.
 * Each entry needs `label`, `icon`, and a `data` object with `nodes` + `edges`
 * in React Flow format.
 */
export const EXAMPLES: ExampleWorkflow[] = [
  { label: 'Competitive Analysis', icon: '🏢', data: competitiveAnalysisExample },
  { label: 'Generic Workflow',     icon: '⚙️', data: genericWorkflowExample },
];
```

### `src/main.tsx`

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import App from './App';
import { ChatPage } from './pages/ChatPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/chat" element={<ChatPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
```

### `src/App.tsx`

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { ChatPanel } from './components/ChatPanel';
import { useWorkflow } from './store/useWorkflow';
import { APP } from './workflow.config';
import { fetchProjects, fetchWorkflow, saveWorkflow } from './api';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function App() {
  const { nodes, edges, selectedNodeId, importJSON } = useWorkflow();

  const [projects, setProjects]           = useState<string[]>([]);
  const [activeProject, setActiveProject] = useState('');
  const [saveStatus, setSaveStatus]       = useState<SaveStatus>('idle');
  const [showChat, setShowChat]           = useState(false);

  const saveTimer        = useRef<ReturnType<typeof setTimeout>>();
  const activeProjectRef = useRef('');
  const skipNextSave     = useRef(false);

  // Load from ?workflow=<url> query param
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('workflow');
    if (!param || (!param.startsWith('http://') && !param.startsWith('https://'))) return;
    fetch(param)
      .then((r) => r.text())
      .then(importJSON)
      .catch((err) => console.error('Failed to load workflow from URL:', err));
  }, [importJSON]);

  // Discover projects from persistence server
  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  // Switch project: load its workflow.json
  const handleProjectChange = useCallback(async (name: string) => {
    activeProjectRef.current = name;
    setActiveProject(name);
    setSaveStatus('idle');
    if (!name) return;
    try {
      const data = await fetchWorkflow(name);
      skipNextSave.current = true;
      importJSON(JSON.stringify(data));
    } catch (e) {
      console.error('Failed to load project workflow:', e);
    }
  }, [importJSON]);

  // Auto-save on canvas change (debounced 1 s)
  useEffect(() => {
    const project = activeProjectRef.current;
    if (!project) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }

    clearTimeout(saveTimer.current);
    setSaveStatus('idle');
    saveTimer.current = setTimeout(async () => {
      const current = activeProjectRef.current;
      if (!current) return;
      setSaveStatus('saving');
      try {
        await saveWorkflow(current, { nodes, edges });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('error');
      }
    }, 1000);

    return () => clearTimeout(saveTimer.current);
  }, [nodes, edges]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar__title">{APP.title}</span>

        {projects.length > 0 && (
          <select
            className="topbar__project-select"
            value={activeProject}
            onChange={(e) => void handleProjectChange(e.target.value)}
          >
            <option value="">— local only —</option>
            {projects.map((p) => (
              <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
            ))}
          </select>
        )}

        {activeProject && saveStatus !== 'idle' && (
          <span className={`topbar__save-status topbar__save-status--${saveStatus}`}>
            {saveStatus === 'saving' && '↑ saving…'}
            {saveStatus === 'saved'  && '✓ saved'}
            {saveStatus === 'error'  && '✗ save failed'}
          </span>
        )}

        <Link
          to={activeProject ? `/chat?project=${encodeURIComponent(activeProject)}` : '/chat'}
          className="topbar__chat-btn"
        >
          💬 Chat
        </Link>

        <button
          className={`topbar__agent-btn${showChat ? ' topbar__agent-btn--active' : ''}`}
          onClick={() => setShowChat((v) => !v)}
          title="Toggle agent sidebar"
        >
          🤖 Agent
        </button>

        <div className="topbar__stats">
          <span>{nodes.length} nodes</span>
          <span>·</span>
          <span>{edges.length} edges</span>
          {selectedNodeId && (
            <>
              <span>·</span>
              <span className="topbar__selected">selected: <code>{selectedNodeId}</code></span>
            </>
          )}
        </div>

        {APP.githubUrl && (
          <a className="topbar__link" href={APP.githubUrl} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        )}
      </header>

      <div className="layout">
        <Sidebar />
        <main className="canvas-wrap">
          <Canvas />
        </main>
        <Inspector />
        {showChat && <ChatPanel activeProject={activeProject} />}
      </div>
    </div>
  );
}
```

### `src/App.css`

```css
/* ── Reset & base ──────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0F172A; color: #F1F5F9; }

/* ── Layout ────────────────────────────────────────────────────────────── */
.app   { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.layout { display: flex; flex: 1; overflow: hidden; }

/* ── Topbar ────────────────────────────────────────────────────────────── */
.topbar {
  height: 44px; display: flex; align-items: center; gap: 12px;
  padding: 0 16px; background: #1E293B; border-bottom: 1px solid #334155;
  flex-shrink: 0;
}
.topbar__title   { font-weight: 600; font-size: 14px; color: #F1F5F9; }
.topbar__stats   { display: flex; gap: 6px; font-size: 12px; color: #64748B; margin-left: auto; }
.topbar__selected code { font-size: 11px; background: #334155; padding: 1px 5px; border-radius: 4px; color: #93C5FD; }
.topbar__link    { font-size: 12px; color: #64748B; text-decoration: none; }
.topbar__link:hover { color: #F1F5F9; }

.topbar__back {
  font-size: 12px; color: #94A3B8; text-decoration: none;
  padding: 3px 8px; border-radius: 6px; border: 1px solid #334155;
  transition: background 0.15s, color 0.15s;
}
.topbar__back:hover { background: #334155; color: #E2E8F0; }

.topbar__chat-btn {
  padding: 3px 10px; border-radius: 6px; font-size: 12px;
  background: transparent; border: 1px solid #334155; color: #94A3B8;
  cursor: pointer; transition: background 0.15s, color 0.15s;
  text-decoration: none;
}
.topbar__chat-btn:hover           { background: #334155; color: #E2E8F0; }
.topbar__chat-btn--active         { background: #1D4ED8; border-color: #1D4ED8; color: #fff; }
.topbar__chat-btn--active:hover   { background: #2563EB; }

.topbar__agent-btn {
  padding: 3px 10px; border-radius: 6px; font-size: 12px;
  background: transparent; border: 1px solid #334155; color: #94A3B8;
  cursor: pointer; transition: background 0.15s, color 0.15s;
  font-family: inherit;
}
.topbar__agent-btn:hover          { background: #334155; color: #E2E8F0; }
.topbar__agent-btn--active        { background: #065F46; border-color: #065F46; color: #fff; }
.topbar__agent-btn--active:hover  { background: #047857; }

.topbar__project-select {
  background: #0F172A; color: #E2E8F0; border: 1px solid #334155;
  border-radius: 6px; padding: 3px 8px; font-size: 12px;
  cursor: pointer; outline: none; max-width: 180px;
}
.topbar__project-select:focus { border-color: #3B82F6; }

.topbar__save-status         { font-size: 11px; }
.topbar__save-status--saving { color: #94A3B8; }
.topbar__save-status--saved  { color: #34D399; }
.topbar__save-status--error  { color: #F87171; }

/* ── Sidebar ───────────────────────────────────────────────────────────── */
.sidebar {
  width: 240px; flex-shrink: 0; background: #1E293B;
  border-right: 1px solid #334155; overflow-y: auto;
  display: flex; flex-direction: column; gap: 0;
}
.sidebar__brand {
  display: flex; align-items: center; gap: 10px;
  padding: 16px; border-bottom: 1px solid #334155;
}
.sidebar__logo  { font-size: 22px; }
.sidebar__name  { font-size: 14px; font-weight: 700; color: #F1F5F9; }
.sidebar__sub   { font-size: 11px; color: #64748B; }

.sidebar__section { padding: 12px; border-bottom: 1px solid #334155; }
.sidebar__section--bottom { margin-top: auto; }
.sidebar__section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #64748B; margin-bottom: 6px; }
.sidebar__hint  { font-size: 10px; color: #475569; margin-bottom: 8px; }

.sidebar__item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 8px; border-radius: 6px; cursor: grab; user-select: none;
  transition: background 0.15s;
}
.sidebar__item:hover  { background: #334155; }
.sidebar__item:active { cursor: grabbing; }

.sidebar__item-dot {
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px;
}
.sidebar__item-name { font-size: 13px; font-weight: 600; color: #E2E8F0; }
.sidebar__item-desc { font-size: 11px; color: #64748B; margin-top: 1px; }

.sidebar__btn {
  display: block; width: 100%; text-align: left;
  padding: 8px 10px; border-radius: 6px; font-size: 13px;
  background: #334155; color: #E2E8F0;
  border: none; cursor: pointer; margin-bottom: 6px;
  transition: background 0.15s;
}
.sidebar__btn:hover           { background: #475569; }
.sidebar__btn--outline        { background: transparent; border: 1px solid #334155; }
.sidebar__btn--outline:hover  { background: #1E293B; }
.sidebar__btn--danger         { background: transparent; color: #FCA5A5; border: 1px solid #7F1D1D; }
.sidebar__btn--danger:hover   { background: #7F1D1D33; }

/* ── Canvas ────────────────────────────────────────────────────────────── */
.canvas-wrap { flex: 1; overflow: hidden; background: #F1F5F9; }

/* ── Inspector ─────────────────────────────────────────────────────────── */
.inspector {
  width: 300px; flex-shrink: 0; background: #1E293B;
  border-left: 1px solid #334155; overflow-y: auto;
  padding: 16px; display: flex; flex-direction: column; gap: 12px;
}
.inspector--empty {
  align-items: center; justify-content: center;
  color: #475569; font-size: 13px; text-align: center;
}

.insp__header   { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.insp__badge    { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 99px; color: #fff; text-transform: uppercase; letter-spacing: .06em; }
.insp__id       { font-size: 11px; color: #64748B; font-family: monospace; }

.insp__field    { display: flex; flex-direction: column; gap: 4px; }
.insp__label    { font-size: 11px; font-weight: 600; color: #94A3B8; text-transform: uppercase; letter-spacing: .06em; }

.insp__input,
.insp__textarea,
.insp__select {
  background: #0F172A; color: #E2E8F0; border: 1px solid #334155;
  border-radius: 6px; padding: 6px 8px; font-size: 13px;
  font-family: inherit; outline: none; resize: vertical;
  transition: border-color 0.15s;
}
.insp__input:focus,
.insp__textarea:focus,
.insp__select:focus { border-color: #3B82F6; }

/* ── Workflow nodes ────────────────────────────────────────────────────── */
.wf-node {
  width: 220px; background: #fff; border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,.12); overflow: hidden;
  border: 1.5px solid #E2E8F0;
}
.wf-node.selected, .wf-node:focus-within { border-color: #3B82F6; }

.wf-node__header {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px;
}
.wf-node__icon  { font-size: 14px; }
.wf-node__type  { font-size: 11px; font-weight: 700; color: rgba(255,255,255,.9); text-transform: uppercase; letter-spacing: .06em; }

.wf-node__body  { padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
.wf-node__label { font-size: 13px; font-weight: 700; color: #0F172A; }
.wf-node__desc  { font-size: 11px; color: #64748B; line-height: 1.4; }

.wf-node__fields  { margin-top: 4px; display: flex; flex-direction: column; gap: 3px; }
.wf-node__field-row { display: flex; align-items: center; flex-wrap: wrap; gap: 3px; }
.wf-node__field-dir { font-size: 10px; font-weight: 700; color: #94A3B8; width: 20px; flex-shrink: 0; }

.wf-node__chip {
  font-size: 10px; padding: 1px 5px; border-radius: 4px;
  font-family: monospace; font-weight: 500;
}
.wf-node__chip--in  { background: #DBEAFE; color: #1D4ED8; }
.wf-node__chip--out { background: #D1FAE5; color: #065F46; }

.wf-node__branches {
  display: flex; justify-content: space-between;
  font-size: 11px; font-weight: 600; padding: 2px 0;
}

/* ── Chat shared (ChatPage full-screen + ChatPanel inline sidebar) ─────── */
.chat-msg { display: flex; flex-direction: column; gap: 3px; }
.chat-msg__label { font-size: 10px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: .06em; }
.chat-msg--user .chat-msg__label { color: #60A5FA; align-self: flex-end; }
.chat-msg--user .chat-msg__bubble { align-self: flex-end; }

.chat-msg__bubble {
  max-width: 100%; background: #0F172A; border-radius: 8px;
  padding: 8px 10px; border: 1px solid #334155;
}
.chat-msg--user .chat-msg__bubble { background: #1D4ED820; border-color: #1D4ED8; }
.chat-msg--error .chat-msg__bubble { background: #7F1D1D20; border-color: #991B1B; }

.chat-msg__text {
  font-size: 13px; color: #E2E8F0; white-space: pre-wrap; word-break: break-word;
  font-family: inherit; margin: 0;
}
.chat-msg__thinking { font-size: 12px; color: #64748B; font-style: italic; }

.chat-panel__empty {
  margin: auto; text-align: center; color: #475569; font-size: 13px;
  display: flex; flex-direction: column; gap: 8px; padding: 24px;
}

.chat-panel__input {
  flex: 1; background: #0F172A; color: #E2E8F0; border: 1px solid #334155;
  border-radius: 6px; padding: 8px; font-size: 13px; font-family: inherit;
  outline: none; resize: none; line-height: 1.4;
  transition: border-color 0.15s;
}
.chat-panel__input:focus { border-color: #3B82F6; }
.chat-panel__input:disabled { opacity: 0.5; }

.chat-panel__send {
  width: 36px; height: 36px; border-radius: 6px; border: none;
  background: #2563EB; color: #fff; font-size: 16px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: background 0.15s;
}
.chat-panel__send:hover:not(:disabled) { background: #1D4ED8; }
.chat-panel__send:disabled { opacity: 0.4; cursor: not-allowed; }

.chat-panel__spinner {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Chat full-page (/chat route) ──────────────────────────────────────── */
.chat-page  { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

.chat-full {
  flex: 1; display: flex; flex-direction: column; overflow: hidden;
  max-width: 860px; width: 100%; margin: 0 auto;
  padding: 0 16px;
}

.chat-full__messages {
  flex: 1; overflow-y: auto; padding: 20px 0;
  display: flex; flex-direction: column; gap: 16px;
}

.chat-full__footer {
  display: flex; gap: 8px; padding: 12px 0 16px;
  border-top: 1px solid #334155; align-items: flex-end;
}

/* ── Data-flow edge labels ─────────────────────────────────────────────── */
.wf-edge-label {
  position: absolute;
  background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 4px;
  font-size: 10px; font-family: monospace; color: #475569;
  padding: 1px 6px; pointer-events: all; white-space: nowrap;
}
```

### `src/pages/ChatPage.tsx`

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { streamChat, fetchProjects, type ChatMessage } from '../api';
import { APP } from '../workflow.config';

const WORKFLOW_JSON_RE = /```(?:json)?\s*(\{[\s\S]*?"nodes"[\s\S]*?"edges"[\s\S]*?\})\s*```/;

function extractWorkflowJSON(text: string): string | null {
  const m = text.match(WORKFLOW_JSON_RE);
  if (!m) return null;
  try { JSON.parse(m[1]); return m[1]; } catch { return null; }
}

function workflowToBase64(json: string): string {
  return btoa(json);
}

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

export function ChatPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [projects, setProjects]           = useState<string[]>([]);
  const [activeProject, setActiveProject] = useState(searchParams.get('project') ?? '');
  const [messages, setMessages]           = useState<Msg[]>([]);
  const [input, setInput]                 = useState('');
  const [streaming, setStreaming]         = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleProjectChange = useCallback((name: string) => {
    setActiveProject(name);
    const url = name ? `/chat?project=${encodeURIComponent(name)}` : '/chat';
    navigate(url, { replace: true });
  }, [navigate]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', content: text };
    const aiId = `a-${Date.now()}`;
    const aiMsg: Msg = { id: aiId, role: 'assistant', content: '' };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput('');
    setStreaming(true);

    const history: ChatMessage[] = [...messages, userMsg].map(({ role, content }) => ({ role, content }));

    try {
      await streamChat(
        history,
        activeProject,
        (chunk) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, content: m.content + chunk } : m)),
          );
        },
        (errMsg) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, content: errMsg, error: true } : m)),
          );
        },
      );
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiId ? { ...m, content: String(e), error: true } : m,
        ),
      );
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  const lastAI = [...messages].reverse().find((m) => m.role === 'assistant' && m.content);
  const embeddedJSON = lastAI ? extractWorkflowJSON(lastAI.content) : null;
  const builderHref = embeddedJSON
    ? `/?workflow=${encodeURIComponent(workflowToBase64(embeddedJSON))}`
    : '/';

  return (
    <div className="chat-page">
      <header className="topbar">
        <Link to="/" className="topbar__back">← Builder</Link>
        <span className="topbar__title">{APP.title} — Agent Chat</span>

        {projects.length > 0 && (
          <select
            className="topbar__project-select"
            value={activeProject}
            onChange={(e) => handleProjectChange(e.target.value)}
          >
            <option value="">— no project —</option>
            {projects.map((p) => (
              <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
            ))}
          </select>
        )}

        {embeddedJSON && (
          <Link to={builderHref} className="topbar__chat-btn topbar__chat-btn--active">
            ↙ Open in Builder
          </Link>
        )}
      </header>

      <div className="chat-full">
        <div className="chat-full__messages" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="chat-panel__empty">
              <p>Describe the workflow you want to build.</p>
              <p>The agent will help plan it — if it outputs a workflow definition you can open it in the Builder.</p>
              {!activeProject && projects.length > 0 && (
                <p style={{ color: '#64748B', fontSize: '11px' }}>
                  Select a project above to route your message to the right agent.
                </p>
              )}
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-msg chat-msg--${msg.role}${msg.error ? ' chat-msg--error' : ''}`}
              >
                <div className="chat-msg__label">{msg.role === 'user' ? 'You' : 'Agent'}</div>
                <div className="chat-msg__bubble">
                  {msg.content
                    ? <pre className="chat-msg__text">{msg.content}</pre>
                    : streaming && msg.role === 'assistant'
                      ? <span className="chat-msg__thinking">thinking…</span>
                      : null
                  }
                </div>
              </div>
            ))
          )}
        </div>

        <div className="chat-full__footer">
          <textarea
            ref={inputRef}
            className="chat-panel__input"
            placeholder={activeProject
              ? `Describe a workflow for "${activeProject.replace(/_/g, ' ')}"…`
              : 'Describe the workflow you want to build…'}
            rows={3}
            value={input}
            disabled={streaming}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
            }}
          />
          <button
            className="chat-panel__send"
            disabled={!input.trim() || streaming}
            onClick={() => void send()}
            title="Send (Enter)"
          >
            {streaming ? <span className="chat-panel__spinner" /> : '↑'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### `src/data/examples.ts`

```ts
import type { Node, Edge } from '@xyflow/react';
import type { WorkflowNodeData } from '../types';

// ── Replace or extend with your own example workflows ──────────────────────

const caNodes: Node<WorkflowNodeData>[] = [
  { id: 'start', type: 'io', position: { x: 40, y: 220 },
    data: { label: 'User Input', nodeKind: 'start', description: 'Company name from user message', outputFields: ['messages'] } },
  { id: 'extract_company', type: 'process', position: { x: 260, y: 220 },
    data: { label: 'Extract Company', nodeKind: 'tool', toolName: 'company_extractor', description: 'Parse company name from message text', inputFields: ['messages'], outputFields: ['task_description'] } },
  { id: 'company_research', type: 'process', position: { x: 520, y: 60 },
    data: { label: 'Company Research', nodeKind: 'subagent', subagentType: 'ca-researcher', timeoutSeconds: 300, description: 'Profile, products, funding & recent news', inputFields: ['task_description'], outputFields: ['execution_results[company]'] } },
  { id: 'competitor_research', type: 'process', position: { x: 520, y: 220 },
    data: { label: 'Competitor Research', nodeKind: 'subagent', subagentType: 'ca-researcher', timeoutSeconds: 300, description: 'Top 3–5 competitors with comparison table', inputFields: ['task_description'], outputFields: ['execution_results[competitors]'] } },
  { id: 'market_research', type: 'process', position: { x: 520, y: 380 },
    data: { label: 'Market Research', nodeKind: 'subagent', subagentType: 'ca-researcher', timeoutSeconds: 300, description: 'Market size, trends, growth drivers & risks', inputFields: ['task_description'], outputFields: ['execution_results[market]'] } },
  { id: 'generate_report', type: 'process', position: { x: 820, y: 220 },
    data: { label: 'Generate Report', nodeKind: 'llm', model: 'default', description: 'Synthesise research into Markdown report', prompt: 'COMPETITIVE_REPORT_PROMPT_TEMPLATE', inputFields: ['task_description', 'execution_results'], outputFields: ['final_output'] } },
  { id: 'save_report', type: 'process', position: { x: 1080, y: 220 },
    data: { label: 'Save Report', nodeKind: 'tool', toolName: 'write_file', description: 'Write to disk and append file path to output', inputFields: ['final_output', 'task_description'], outputFields: ['final_output'] } },
  { id: 'end', type: 'io', position: { x: 1330, y: 220 },
    data: { label: 'Report Output', nodeKind: 'end', description: 'Competitive analysis Markdown report', inputFields: ['final_output'] } },
];

const caEdges: Edge[] = [
  { id: 'e-start-extract',      source: 'start',              target: 'extract_company',     type: 'dataflow', animated: true, label: 'messages' },
  { id: 'e-extract-company',    source: 'extract_company',     target: 'company_research',    type: 'dataflow', animated: true, label: 'task_description' },
  { id: 'e-extract-competitor', source: 'extract_company',     target: 'competitor_research', type: 'dataflow', animated: true, label: 'task_description' },
  { id: 'e-extract-market',     source: 'extract_company',     target: 'market_research',     type: 'dataflow', animated: true, label: 'task_description' },
  { id: 'e-company-report',     source: 'company_research',    target: 'generate_report',     type: 'dataflow', animated: true, label: 'execution_results' },
  { id: 'e-competitor-report',  source: 'competitor_research', target: 'generate_report',     type: 'dataflow', animated: true, label: 'execution_results' },
  { id: 'e-market-report',      source: 'market_research',     target: 'generate_report',     type: 'dataflow', animated: true, label: 'execution_results' },
  { id: 'e-report-save',        source: 'generate_report',     target: 'save_report',         type: 'dataflow', animated: true, label: 'final_output' },
  { id: 'e-save-end',           source: 'save_report',         target: 'end',                 type: 'dataflow', animated: true, label: 'final_output' },
];

export const competitiveAnalysisExample = { nodes: caNodes, edges: caEdges };

const gwNodes: Node<WorkflowNodeData>[] = [
  { id: 'start', type: 'io', position: { x: 40, y: 280 },
    data: { label: 'User Input', nodeKind: 'start', description: 'User task description', outputFields: ['messages'] } },
  { id: 'parse_input', type: 'process', position: { x: 250, y: 280 },
    data: { label: 'Parse Input', nodeKind: 'tool', description: 'Extract task_description from latest human message', inputFields: ['messages'], outputFields: ['task_description'] } },
  { id: 'decompose', type: 'process', position: { x: 480, y: 280 },
    data: { label: 'Decompose', nodeKind: 'llm', description: 'Break task into 2–5 independent subtasks', prompt: 'DECOMPOSE_PROMPT', inputFields: ['task_description'], outputFields: ['subtasks'] } },
  { id: 'search_skills', type: 'process', position: { x: 710, y: 280 },
    data: { label: 'Search Skills', nodeKind: 'tool', toolName: 'get_or_new_skill_storage', description: 'List all enabled skills for context', inputFields: ['subtasks'], outputFields: ['available_skills'] } },
  { id: 'plan_workflow', type: 'process', position: { x: 940, y: 280 },
    data: { label: 'Plan Workflow', nodeKind: 'llm', description: 'Assign subtasks to subagents & scaffold project dir', prompt: 'PLAN_PROMPT', inputFields: ['task_description', 'subtasks', 'available_skills'], outputFields: ['subagent_assignments', 'project_dir'] } },
  { id: 'subtask_1', type: 'process', position: { x: 1200, y: 140 },
    data: { label: 'execute_subtask (1)', nodeKind: 'subagent', subagentType: 'general-purpose', description: 'Runs in parallel via Send — one node per assignment', inputFields: ['prompt', 'subagent_type'], outputFields: ['execution_results[+]'] } },
  { id: 'subtask_2', type: 'process', position: { x: 1200, y: 300 },
    data: { label: 'execute_subtask (2)', nodeKind: 'subagent', subagentType: 'general-purpose', description: 'Runs in parallel via Send — one node per assignment', inputFields: ['prompt', 'subagent_type'], outputFields: ['execution_results[+]'] } },
  { id: 'subtask_n', type: 'process', position: { x: 1200, y: 460 },
    data: { label: 'execute_subtask (N)', nodeKind: 'subagent', subagentType: 'general-purpose', description: 'Runs in parallel via Send — one node per assignment', inputFields: ['prompt', 'subagent_type'], outputFields: ['execution_results[+]'] } },
  { id: 'evaluate', type: 'process', position: { x: 1470, y: 300 },
    data: { label: 'Evaluate', nodeKind: 'llm', description: 'Score each result; set all_passed flag', prompt: 'EVALUATE_PROMPT', inputFields: ['execution_results', 'task_description'], outputFields: ['evaluation_results', 'all_passed'] } },
  { id: 'retry_check', type: 'condition', position: { x: 1700, y: 300 },
    data: { label: 'Retry?', nodeKind: 'condition', description: 'all_passed=False and retry_count < 2 → retry failed tasks', inputFields: ['all_passed', 'retry_count'], outputFields: ['→ prepare_retry', '→ synthesize'] } },
  { id: 'prepare_retry', type: 'process', position: { x: 1700, y: 480 },
    data: { label: 'Prepare Retry', nodeKind: 'tool', description: 'Filter assignments to failed subtasks; increment retry_count', inputFields: ['evaluation_results', 'subagent_assignments'], outputFields: ['subagent_assignments', 'retry_count'] } },
  { id: 'synthesize', type: 'process', position: { x: 1940, y: 220 },
    data: { label: 'Synthesize', nodeKind: 'llm', description: 'Write final response covering results and next steps', prompt: 'SYNTHESIZE_PROMPT', inputFields: ['execution_results', 'evaluation_results', 'task_description'], outputFields: ['final_output'] } },
  { id: 'end', type: 'io', position: { x: 2180, y: 220 },
    data: { label: 'Output', nodeKind: 'end', description: 'Final synthesised response', inputFields: ['final_output'] } },
];

const gwEdges: Edge[] = [
  { id: 'g1',  source: 'start',         target: 'parse_input',   type: 'dataflow', animated: true, label: 'messages' },
  { id: 'g2',  source: 'parse_input',   target: 'decompose',     type: 'dataflow', animated: true, label: 'task_description' },
  { id: 'g3',  source: 'decompose',     target: 'search_skills', type: 'dataflow', animated: true, label: 'subtasks' },
  { id: 'g4',  source: 'search_skills', target: 'plan_workflow', type: 'dataflow', animated: true, label: 'available_skills' },
  { id: 'g5',  source: 'plan_workflow', target: 'subtask_1',     type: 'dataflow', animated: true, label: 'Send ×N' },
  { id: 'g6',  source: 'plan_workflow', target: 'subtask_2',     type: 'dataflow', animated: true, label: 'Send ×N' },
  { id: 'g7',  source: 'plan_workflow', target: 'subtask_n',     type: 'dataflow', animated: true, label: 'Send ×N' },
  { id: 'g8',  source: 'subtask_1',     target: 'evaluate',      type: 'dataflow', animated: true, label: 'execution_results' },
  { id: 'g9',  source: 'subtask_2',     target: 'evaluate',      type: 'dataflow', animated: true, label: 'execution_results' },
  { id: 'g10', source: 'subtask_n',     target: 'evaluate',      type: 'dataflow', animated: true, label: 'execution_results' },
  { id: 'g11', source: 'evaluate',      target: 'retry_check',   type: 'dataflow', animated: true, label: 'evaluation_results' },
  { id: 'g12', source: 'retry_check',   target: 'prepare_retry', type: 'dataflow', animated: true, label: 'false', sourceHandle: 'false' },
  { id: 'g13', source: 'retry_check',   target: 'synthesize',    type: 'dataflow', animated: true, label: 'true',  sourceHandle: 'true' },
  { id: 'g14', source: 'prepare_retry', target: 'subtask_1',     type: 'dataflow', animated: true, label: 'Send ×M' },
  { id: 'g15', source: 'synthesize',    target: 'end',           type: 'dataflow', animated: true, label: 'final_output' },
];

export const genericWorkflowExample = { nodes: gwNodes, edges: gwEdges };
```

### `src/store/useWorkflow.ts`

```ts
import { create } from 'zustand';
import {
  applyEdgeChanges, applyNodeChanges, addEdge,
  type Node, type Edge, type NodeChange, type EdgeChange,
  type Connection, type XYPosition,
} from '@xyflow/react';
import { type WorkflowNodeData, type NodeKind } from '../types';
import { getNodeKindDef, EXAMPLES } from '../workflow.config';

let _nodeCounter = 200;

interface WorkflowStore {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;

  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  selectNode: (id: string | null) => void;
  updateNodeData: (id: string, patch: Partial<WorkflowNodeData>) => void;
  addNode: (kind: NodeKind, position: XYPosition) => void;
  loadExample: (index: number) => void;
  importJSON: (json: string) => void;
  clearWorkflow: () => void;
  exportJSON: () => string;
}

function loadFromBase64Param(): { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } | null {
  try {
    const param = new URLSearchParams(window.location.search).get('workflow');
    if (!param || param.startsWith('http://') || param.startsWith('https://')) return null;
    const data = JSON.parse(atob(param)) as { nodes: Node<WorkflowNodeData>[]; edges: Edge[] };
    if (Array.isArray(data.nodes) && Array.isArray(data.edges)) return data;
  } catch { /* ignored */ }
  return null;
}

const _default = EXAMPLES[0]?.data ?? { nodes: [], edges: [] };
const _urlState = loadFromBase64Param();

export const useWorkflow = create<WorkflowStore>((set, get) => ({
  nodes: (_urlState ?? _default).nodes,
  edges: (_urlState ?? _default).edges,
  selectedNodeId: null,

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) as Node<WorkflowNodeData>[] })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

  onConnect: (connection) =>
    set((s) => ({
      edges: addEdge({ ...connection, type: 'dataflow', animated: true }, s.edges),
    })),

  selectNode: (id) => set({ selectedNodeId: id }),

  updateNodeData: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    })),

  addNode: (kind, position) => {
    const id = `node_${++_nodeCounter}`;
    const def = getNodeKindDef(kind);
    set((s) => ({
      nodes: [
        ...s.nodes,
        {
          id,
          type: def.rfType,
          position,
          data: { label: `New ${def.label}`, nodeKind: kind, description: '', inputFields: [], outputFields: [] },
        },
      ],
      selectedNodeId: id,
    }));
  },

  loadExample: (index) => {
    const ex = EXAMPLES[index]?.data ?? _default;
    set({ nodes: ex.nodes, edges: ex.edges, selectedNodeId: null });
  },

  importJSON: (json) => {
    try {
      const data = JSON.parse(json) as { nodes: Node<WorkflowNodeData>[]; edges: Edge[] };
      if (!Array.isArray(data.nodes) || !Array.isArray(data.edges))
        throw new Error('Expected { nodes: [...], edges: [...] }');
      set({ nodes: data.nodes, edges: data.edges, selectedNodeId: null });
    } catch (e) {
      alert(`Invalid workflow JSON: ${(e as Error).message}`);
    }
  },

  clearWorkflow: () => set({ nodes: [], edges: [], selectedNodeId: null }),

  exportJSON: () => {
    const { nodes, edges } = get();
    return JSON.stringify(
      {
        nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
        edges: edges.map(({ id, source, target, sourceHandle, targetHandle, label }) => ({
          id, source, target, sourceHandle, targetHandle, label,
        })),
      },
      null,
      2,
    );
  },
}));
```

### `src/nodes/index.tsx`

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getNodeKindDef, type NodeKindDef } from '../workflow.config';
import type { WorkflowNodeData } from '../types';

function NodeShell({ data, def, children }: { data: WorkflowNodeData; def: NodeKindDef; children?: React.ReactNode }) {
  return (
    <div className="wf-node">
      <div className="wf-node__header" style={{ background: def.color }}>
        <span className="wf-node__icon">{def.icon}</span>
        <span className="wf-node__type">{def.label}</span>
      </div>
      <div className="wf-node__body">
        <p className="wf-node__label">{data.label}</p>
        {data.description && <p className="wf-node__desc">{data.description}</p>}
        {children}
        {(data.inputFields?.length || data.outputFields?.length) ? (
          <div className="wf-node__fields">
            {data.inputFields?.length ? (
              <div className="wf-node__field-row">
                <span className="wf-node__field-dir">In</span>
                {data.inputFields.map((f) => <span key={f} className="wf-node__chip wf-node__chip--in">{f}</span>)}
              </div>
            ) : null}
            {data.outputFields?.length ? (
              <div className="wf-node__field-row">
                <span className="wf-node__field-dir">Out</span>
                {data.outputFields.map((f) => <span key={f} className="wf-node__chip wf-node__chip--out">{f}</span>)}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function IONode({ data }: NodeProps) {
  const d = data as WorkflowNodeData;
  const def = getNodeKindDef(d.nodeKind);
  return (
    <>
      {def.handles !== 'source-only' && <Handle type="target" position={Position.Left} />}
      <NodeShell data={d} def={def} />
      {def.handles !== 'target-only' && <Handle type="source" position={Position.Right} />}
    </>
  );
}

export function ProcessNode({ data }: NodeProps) {
  const d = data as WorkflowNodeData;
  const def = getNodeKindDef(d.nodeKind);
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <NodeShell data={d} def={def} />
      <Handle type="source" position={Position.Right} />
    </>
  );
}

export function ConditionNode({ data }: NodeProps) {
  const d = data as WorkflowNodeData;
  const def = getNodeKindDef(d.nodeKind);
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <NodeShell data={d} def={def}>
        <div className="wf-node__branches">
          <span style={{ color: '#059669' }}>↗ true</span>
          <span style={{ color: '#DC2626' }}>↘ false</span>
        </div>
      </NodeShell>
      <Handle type="source" position={Position.Right} id="true"  style={{ top: '38%' }} />
      <Handle type="source" position={Position.Right} id="false" style={{ top: '62%' }} />
    </>
  );
}

export const nodeTypes = { io: IONode, process: ProcessNode, condition: ConditionNode };
```

### `src/edges/index.tsx`

```tsx
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

export function DataFlowEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, label, markerEnd, style,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="wf-edge-label nodrag nopan"
            style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}
          >
            {String(label)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = { dataflow: DataFlowEdge };
```

### `src/components/Canvas.tsx`

```tsx
import { useCallback } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  ReactFlowProvider, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflow } from '../store/useWorkflow';
import { nodeTypes } from '../nodes';
import { edgeTypes } from '../edges';
import { type NodeKind } from '../types';

function FlowCanvas() {
  const { screenToFlowPosition } = useReactFlow();
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, selectNode, addNode } = useWorkflow();

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData('nodeKind') as NodeKind;
    if (!kind) return;
    addNode(kind, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }, [screenToFlowPosition, addNode]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <ReactFlow
      nodes={nodes} edges={edges}
      nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
      onNodeClick={(_, node) => selectNode(node.id)}
      onPaneClick={() => selectNode(null)}
      onDrop={onDrop} onDragOver={onDragOver}
      fitView deleteKeyCode="Delete"
      defaultEdgeOptions={{ type: 'dataflow', animated: true }}
    >
      <Background gap={20} color="#CBD5E1" />
      <Controls />
      <MiniMap nodeStrokeWidth={3} pannable zoomable />
    </ReactFlow>
  );
}

export function Canvas() {
  return <ReactFlowProvider><FlowCanvas /></ReactFlowProvider>;
}
```

### `src/components/Sidebar.tsx`

```tsx
import { useRef } from 'react';
import { NODE_KINDS, EXAMPLES, APP } from '../workflow.config';
import { useWorkflow } from '../store/useWorkflow';

export function Sidebar() {
  const { loadExample, clearWorkflow, exportJSON, importJSON } = useWorkflow();
  const fileRef = useRef<HTMLInputElement>(null);

  const onDragStart = (e: React.DragEvent, kind: string) => {
    e.dataTransfer.setData('nodeKind', kind);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleExport = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'workflow.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => importJSON(ev.target?.result as string);
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo">{APP.logo}</span>
        <div>
          <div className="sidebar__name">{APP.title}</div>
          <div className="sidebar__sub">{APP.subtitle}</div>
        </div>
      </div>

      <section className="sidebar__section">
        <div className="sidebar__section-title">Node Types</div>
        <div className="sidebar__hint">Drag onto the canvas to add</div>
        {NODE_KINDS.map(({ kind, color, icon, label, desc }) => (
          <div key={kind} className="sidebar__item" draggable onDragStart={(e) => onDragStart(e, kind)}>
            <div className="sidebar__item-dot" style={{ background: color }}>{icon}</div>
            <div>
              <div className="sidebar__item-name">{label}</div>
              <div className="sidebar__item-desc">{desc}</div>
            </div>
          </div>
        ))}
      </section>

      {EXAMPLES.length > 0 && (
        <section className="sidebar__section">
          <div className="sidebar__section-title">Examples</div>
          {EXAMPLES.map(({ label, icon }, index) => (
            <button key={label} className="sidebar__btn" onClick={() => loadExample(index)}>
              {icon} {label}
            </button>
          ))}
        </section>
      )}

      <section className="sidebar__section sidebar__section--bottom">
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleFileChange} />
        <button className="sidebar__btn sidebar__btn--outline" onClick={() => fileRef.current?.click()}>↑ Import JSON</button>
        <button className="sidebar__btn sidebar__btn--outline" onClick={handleExport}>↓ Export JSON</button>
        <button className="sidebar__btn sidebar__btn--danger" onClick={clearWorkflow}>✕ Clear Canvas</button>
      </section>
    </aside>
  );
}
```

### `src/components/Inspector.tsx`

```tsx
import { getNodeKindDef, type NodeKindField } from '../workflow.config';
import { useWorkflow } from '../store/useWorkflow';
import type { WorkflowNodeData } from '../types';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="insp__field">
      <label className="insp__label">{label}</label>
      {children}
    </div>
  );
}

function DynamicField({ field, data, onChange }: {
  field: NodeKindField; data: WorkflowNodeData;
  onChange: (patch: Partial<WorkflowNodeData>) => void;
}) {
  const raw = data[field.key as keyof WorkflowNodeData] as string | number | undefined;
  const value = raw ?? field.default ?? '';

  if (field.type === 'select') return (
    <Field label={field.label}>
      <select className="insp__select" value={String(value)} onChange={(e) => onChange({ [field.key]: e.target.value })}>
        {field.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </Field>
  );
  if (field.type === 'number') return (
    <Field label={field.label}>
      <input className="insp__input" type="number" value={Number(value)} onChange={(e) => onChange({ [field.key]: Number(e.target.value) })} />
    </Field>
  );
  if (field.type === 'textarea') return (
    <Field label={field.label}>
      <textarea className="insp__textarea" rows={field.rows ?? 4} value={String(value)} onChange={(e) => onChange({ [field.key]: e.target.value })} />
    </Field>
  );
  return (
    <Field label={field.label}>
      <input className="insp__input" value={String(value)} onChange={(e) => onChange({ [field.key]: e.target.value })} />
    </Field>
  );
}

export function Inspector() {
  const { nodes, selectedNodeId, updateNodeData } = useWorkflow();
  const node = nodes.find((n) => n.id === selectedNodeId);

  if (!node) return (
    <aside className="inspector inspector--empty">
      <p>Select a node to edit its properties</p>
    </aside>
  );

  const d = node.data as WorkflowNodeData;
  const def = getNodeKindDef(d.nodeKind);
  const up = (patch: Partial<WorkflowNodeData>) => updateNodeData(node.id, patch);

  return (
    <aside className="inspector">
      <div className="insp__header">
        <span className="insp__badge" style={{ background: def.color }}>{def.label}</span>
        <code className="insp__id">{node.id}</code>
      </div>
      <Field label="Name">
        <input className="insp__input" value={d.label} onChange={(e) => up({ label: e.target.value })} />
      </Field>
      <Field label="Description">
        <textarea className="insp__textarea" rows={3} value={d.description ?? ''} onChange={(e) => up({ description: e.target.value })} />
      </Field>
      {def.inspectorFields?.map((field) => (
        <DynamicField key={field.key} field={field} data={d} onChange={up} />
      ))}
      <Field label="Input Fields (one per line)">
        <textarea className="insp__textarea" rows={3}
          value={(d.inputFields ?? []).join('\n')}
          onChange={(e) => up({ inputFields: e.target.value.split('\n').filter(Boolean) })} />
      </Field>
      <Field label="Output Fields (one per line)">
        <textarea className="insp__textarea" rows={3}
          value={(d.outputFields ?? []).join('\n')}
          onChange={(e) => up({ outputFields: e.target.value.split('\n').filter(Boolean) })} />
      </Field>
    </aside>
  );
}
```

---

## Directory structure produced

```
<target-dir>/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── server/                      ← persistence + chat proxy server
│   ├── __init__.py
│   ├── main.py
│   └── requirements.txt
└── src/
    ├── App.css
    ├── App.tsx
    ├── api.ts                   ← fetch/save/stream helpers
    ├── main.tsx
    ├── types.ts
    ├── workflow.config.ts       ← THE file to customise per project
    ├── data/
    │   └── examples.ts
    ├── pages/
    │   └── ChatPage.tsx         ← /chat route — full-page agent chat
    ├── store/
    │   └── useWorkflow.ts
    ├── nodes/
    │   └── index.tsx
    ├── edges/
    │   └── index.tsx
    └── components/
        ├── Canvas.tsx
        ├── Inspector.tsx
        └── Sidebar.tsx
```

## Known pitfalls

- **`@xyflow/react` v12 requires `NodeData extends Record<string, unknown>`** — `WorkflowNodeData` already satisfies this; do not remove `extends Record<string, unknown>`.
- **`useReactFlow()` must be called inside `<ReactFlowProvider>`** — `FlowCanvas` is wrapped by the `Canvas` component.
- **Persistence server path assumes `<target-dir>` is one level below the repo root** — `server/main.py` resolves `projects/` as `../../projects/` relative to itself. Adjust `PROJECTS_DIR` if the layout differs.
- **`?workflow=<url>` requires CORS** on the target server; use base64 for self-contained links.
- **`inspectorFields` keys must be scalar** — do not reference `inputFields` / `outputFields` (arrays) there; they are rendered separately.
- **npm cache permission errors** — use `npm install --cache /tmp/npm-cache` if the default cache is root-owned.
- **Gateway auth** — the persistence server auto-logins once and reuses the cookie. If the gateway restarts, restart the persistence server too (or add a retry in `_gateway()`).
- **Both `/api/workflow` and `/api/chat` must be proxied** — the Vite config has two separate proxy entries pointing to port 8002; omitting `/api/chat` will cause chat requests to 404 in dev.
