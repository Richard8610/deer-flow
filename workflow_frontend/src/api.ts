import { authFetch, authHeaders } from './auth';

const BASE = '/api/workflow';

// ── Chat streaming ──────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Stream a chat turn to the lead_agent via the hub proxy.
 * Calls `onChunk` for each AI text fragment, `onError` on failure.
 */
export async function streamChat(
  messages: ChatMessage[],
  project: string,
  onChunk: (text: string) => void,
  onError: (msg: string) => void,
  options?: { model?: string },
): Promise<void> {
  const payload = {
    assistant_id: 'lead_agent',
    input: { messages },
    stream_mode: ['messages-tuple'],
    on_completion: 'delete',
    ...(options?.model || project
      ? { config: { configurable: { ...(options?.model ? { model_name: options.model } : {}), ...(project ? { project } : {}) } } }
      : {}),
  };

  const resp = await fetch('/api/runs/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream', ...authHeaders() },
    body: JSON.stringify(payload),
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

        if (event === 'messages-tuple' || event === 'messages') {
          try {
            const parsed = JSON.parse(raw) as [{ content: unknown; type: string }, Record<string, unknown>?];
            const [chunk, meta] = parsed;
            const isTitleMiddleware = (meta?.tags as string[] | undefined)?.includes('middleware:title');
            if (chunk.type === 'AIMessageChunk' && !isTitleMiddleware && typeof chunk.content === 'string' && chunk.content) {
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

export interface WorkflowData {
  nodes: unknown[];
  edges: unknown[];
}

export async function fetchProjects(): Promise<string[]> {
  const r = await authFetch(`${BASE}/projects`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = (await r.json()) as { projects: string[] };
  return data.projects;
}

export async function fetchWorkflow(project: string): Promise<WorkflowData> {
  const r = await authFetch(`${BASE}/projects/${encodeURIComponent(project)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<WorkflowData>;
}

export async function saveWorkflow(project: string, data: WorkflowData): Promise<void> {
  const r = await authFetch(`${BASE}/projects/${encodeURIComponent(project)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

export async function createWorkflow(name: string, data: WorkflowData): Promise<string> {
  const r = await authFetch(`${BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, data }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const resp = (await r.json()) as { name: string };
  return resp.name;
}

export interface Skill {
  name: string;
  description: string;
  category: 'public' | 'custom';
}

export interface Model {
  name: string;
  display_name: string | null;
}

export async function fetchModels(): Promise<Model[]> {
  const r = await authFetch('/api/models');
  if (!r.ok) return [];
  const data = (await r.json()) as { models: Model[] };
  return data.models;
}

export async function fetchSkills(): Promise<Skill[]> {
  const r = await authFetch('/api/skills');
  if (!r.ok) return [];
  const data = (await r.json()) as { skills: Skill[] };
  return data.skills;
}

export async function fetchMe(): Promise<{ username: string; pod_ready: boolean }> {
  const r = await authFetch('/me');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<{ username: string; pod_ready: boolean }>;
}