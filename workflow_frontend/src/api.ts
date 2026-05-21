const BASE = '/api/workflow';

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
