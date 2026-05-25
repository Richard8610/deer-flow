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
  options?: { model?: string },
): Promise<void> {
  const resp = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, project, model: options?.model ?? '' }),
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
            // Only forward plain-text AI chunks (skip tool calls, human msgs, etc.)
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
    // SSE events are separated by blank lines
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
  const r = await fetch('/api/models');
  if (!r.ok) return [];
  const data = (await r.json()) as { models: Model[] };
  return data.models;
}

export async function fetchSkills(): Promise<Skill[]> {
  const r = await fetch('/api/skills');
  if (!r.ok) return [];
  const data = (await r.json()) as { skills: Skill[] };
  return data.skills;
}
