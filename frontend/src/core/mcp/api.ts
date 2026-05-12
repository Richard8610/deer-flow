import { fetch } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";
import { requireJson } from "@/core/utils/fetch";

import type { MCPConfig } from "./types";

export async function loadMCPConfig() {
  const response = await fetch(`${getBackendBaseURL()}/api/mcp/config`);
  return requireJson<MCPConfig>(response, "Failed to load MCP config");
}

export async function updateMCPConfig(config: MCPConfig) {
  const response = await fetch(`${getBackendBaseURL()}/api/mcp/config`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(config),
  });
  return requireJson(response, "Failed to update MCP config");
}