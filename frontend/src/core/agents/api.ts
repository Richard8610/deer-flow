import { fetch as fetchWithAuth } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";
import { requireJson } from "@/core/utils/fetch";

import type { Agent, CreateAgentRequest, UpdateAgentRequest, UserProfile } from "./types";

const BACKEND_UNAVAILABLE_STATUSES = new Set([502, 503, 504]);

export class AgentNameCheckError extends Error {
  constructor(
    message: string,
    public readonly reason: "backend_unreachable" | "request_failed",
  ) {
    super(message);
    this.name = "AgentNameCheckError";
  }
}

export class AgentsApiDisabledError extends Error {
  constructor(message = "Agents API is disabled") {
    super(message);
    this.name = "AgentsApiDisabledError";
  }
}

export async function checkAgentName(
  name: string,
): Promise<{ available: boolean; name: string }> {
  let res: Response;
  try {
    res = await fetch(
      `${getBackendBaseURL()}/api/agents/check?name=${encodeURIComponent(name)}`,
    );
  } catch {
    throw new AgentNameCheckError(
      "Could not reach the DeerFlow backend.",
      "backend_unreachable",
    );
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    if (BACKEND_UNAVAILABLE_STATUSES.has(res.status)) {
      throw new AgentNameCheckError(
        "Could not reach the DeerFlow backend.",
        "backend_unreachable",
      );
    }
    throw new AgentNameCheckError(
      err.detail ?? `Failed to check agent name: ${res.statusText}`,
      "request_failed",
    );
  }
  return res.json() as Promise<{ available: boolean; name: string }>;
}

export async function listAgents(): Promise<Agent[]> {
  const res = await fetch(`${getBackendBaseURL()}/api/agents`);
  const data = await requireJson<{ agents: Agent[] }>(res, "Failed to load agents");
  return data.agents;
}

export async function getAgent(name: string): Promise<Agent> {
  const res = await fetch(`${getBackendBaseURL()}/api/agents/${name}`);
  return requireJson<Agent>(res, `Agent '${name}' not found`);
}

export async function createAgent(request: CreateAgentRequest): Promise<Agent> {
  const res = await fetchWithAuth(`${getBackendBaseURL()}/api/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return requireJson<Agent>(res, "Failed to create agent");
}

export async function updateAgent(
  name: string,
  request: UpdateAgentRequest,
): Promise<Agent> {
  const res = await fetchWithAuth(`${getBackendBaseURL()}/api/agents/${name}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return requireJson<Agent>(res, "Failed to update agent");
}

export async function deleteAgent(name: string): Promise<void> {
  const res = await fetchWithAuth(`${getBackendBaseURL()}/api/agents/${name}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete agent: ${res.statusText}`);
}

export async function getUserProfile(): Promise<UserProfile> {
  const res = await fetch(`${getBackendBaseURL()}/api/user-profile`);
  return requireJson<UserProfile>(res, "Failed to load user profile");
}

export async function updateUserProfile(content: string): Promise<UserProfile> {
  const res = await fetchWithAuth(`${getBackendBaseURL()}/api/user-profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  return requireJson<UserProfile>(res, "Failed to update user profile");
}