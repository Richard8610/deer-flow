import { fetch } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";
import { requireJson } from "@/core/utils/fetch";

import type { CustomSkill, Skill } from "./type";

export async function loadSkills() {
  const res = await fetch(`${getBackendBaseURL()}/api/skills`);
  const json = await requireJson<{ skills: Skill[] }>(res, "Failed to load skills");
  return json.skills;
}

export async function enableSkill(skillName: string, enabled: boolean) {
  const response = await fetch(
    `${getBackendBaseURL()}/api/skills/${skillName}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled }),
    },
  );
  return requireJson(response, `Failed to update skill "${skillName}"`);
}

export interface InstallSkillRequest {
  thread_id: string;
  path: string;
}

export interface InstallSkillResponse {
  success: boolean;
  skill_name: string;
  message: string;
}

export async function installSkill(
  request: InstallSkillRequest,
): Promise<InstallSkillResponse> {
  const response = await fetch(`${getBackendBaseURL()}/api/skills/install`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    // Handle HTTP error responses (4xx, 5xx)
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      errorData.detail ?? `HTTP ${response.status}: ${response.statusText}`;
    return {
      success: false,
      skill_name: "",
      message: errorMessage,
    };
  }

  return response.json();
}

async function handleCustomSkillResponse(res: Response, fallback: string): Promise<CustomSkill> {
  return requireJson<CustomSkill>(res, fallback);
}

export async function listCustomSkills(): Promise<CustomSkill[]> {
  const res = await fetch(`${getBackendBaseURL()}/api/skills/custom`);
  const data = await requireJson<{ skills: CustomSkill[] }>(res, "Failed to list custom skills");
  return data.skills;
}

export async function getCustomSkill(name: string): Promise<CustomSkill> {
  const res = await fetch(`${getBackendBaseURL()}/api/skills/custom/${encodeURIComponent(name)}`);
  return handleCustomSkillResponse(res, "Failed to load skill");
}

export async function createCustomSkill(name: string, content: string): Promise<CustomSkill> {
  const res = await fetch(`${getBackendBaseURL()}/api/skills/custom`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content }),
  });
  return handleCustomSkillResponse(res, "Failed to create skill");
}

export async function updateCustomSkill(name: string, content: string): Promise<CustomSkill> {
  const res = await fetch(`${getBackendBaseURL()}/api/skills/custom/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  return handleCustomSkillResponse(res, "Failed to update skill");
}

export async function deleteCustomSkill(name: string): Promise<void> {
  const res = await fetch(`${getBackendBaseURL()}/api/skills/custom/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `Failed to delete skill: ${res.statusText}`);
  }
}
