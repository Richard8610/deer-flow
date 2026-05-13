import { fetch as fetchWithAuth } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";
import { requireJson } from "@/core/utils/fetch";

import type { CreateToolRequest, Tool, ToolGroup, UpdateToolRequest } from "./types";

export async function listTools(): Promise<Tool[]> {
  const res = await fetchWithAuth(`${getBackendBaseURL()}/api/tools`);
  const data = await requireJson<{ tools: Tool[] }>(res, "Failed to load tools");
  return data.tools;
}

export async function listToolGroups(): Promise<ToolGroup[]> {
  const res = await fetchWithAuth(`${getBackendBaseURL()}/api/tool-groups`);
  const data = await requireJson<{ tool_groups: ToolGroup[] }>(res, "Failed to load tool groups");
  return data.tool_groups;
}

export async function createTool(request: CreateToolRequest): Promise<Tool> {
  const res = await fetchWithAuth(`${getBackendBaseURL()}/api/tools`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return requireJson<Tool>(res, "Failed to create tool");
}

export async function updateTool(name: string, request: UpdateToolRequest): Promise<Tool> {
  const res = await fetchWithAuth(`${getBackendBaseURL()}/api/tools/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return requireJson<Tool>(res, "Failed to update tool");
}

export async function deleteTool(name: string): Promise<void> {
  const res = await fetchWithAuth(`${getBackendBaseURL()}/api/tools/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `Failed to delete tool: ${res.statusText}`);
  }
}