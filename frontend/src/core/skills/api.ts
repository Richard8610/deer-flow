import { fetch } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";
import { requireJson } from "@/core/utils/fetch";

import type { CustomSkill, Skill } from "./type";

export class SkillRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SkillRequestError";
    this.status = status;
  }

  get isAdminRequired(): boolean {
    return this.status === 403;
  }
}

async function readErrorDetail(response: Response): Promise<string> {
  const data = (await response.json().catch(() => ({}))) as {
    detail?: string;
  };
  return data.detail ?? `HTTP ${response.status}: ${response.statusText}`;
}

export async function loadSkills() {
  const skills = await fetch(`${getBackendBaseURL()}/api/skills`);
  if (!skills.ok) {
    throw new SkillRequestError(skills.status, await readErrorDetail(skills));
  }
  const json = await skills.json();
  return json.skills as Skill[];
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
  if (!response.ok) {
    throw new SkillRequestError(
      response.status,
      await readErrorDetail(response),
    );
  }
  return response.json();
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
    const message = await readErrorDetail(response);
    // Surface authorization failures so callers can show an admin-only hint
    // instead of a generic failure.
    if (response.status === 403) {
      throw new SkillRequestError(response.status, message);
    }
    // Other HTTP errors keep the existing soft-failure contract.
    return {
      success: false,
      skill_name: "",
      message,
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
