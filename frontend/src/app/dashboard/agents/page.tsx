"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  useAgents,
  useCreateAgent,
  useDeleteAgent,
  useUpdateAgent,
  useUpdateUserProfile,
  useUserProfile,
} from "@/core/agents/hooks";
import type { Agent } from "@/core/agents/types";

import { ErrorBanner } from "../_components/backend-offline-banner";
import { DashboardChat } from "../_components/dashboard-chat";

// ── System hints for AI Assist ───────────────────────────────────────────────

const SOUL_CREATOR_HINT =
  "You are helping the user write a SOUL.md file for a DeerFlow custom agent. " +
  "SOUL.md defines the agent's personality, tone, specialization, and behavioral guardrails. " +
  "When asked to create or update a SOUL.md, always include the complete file content in a fenced markdown or text code block. " +
  "The file should start with a `# <Agent Name>` heading, followed by sections for Personality, Instructions, and Guardrails. " +
  "Keep it concise — 100–300 words is ideal. User request:";

const PROFILE_CREATOR_HINT =
  "You are helping the user write a USER.md file for DeerFlow. " +
  "USER.md is a global profile injected into every custom agent so they understand the user's background, preferences, and goals. " +
  "When asked to create or update a USER.md, always include the complete file content in a fenced markdown or text code block. " +
  "Structure: `# About Me`, then background, expertise, communication style, and preferences. " +
  "Keep it concise — 100–200 words. User request:";

// Extract the first fenced code block from an AI response that looks like a markdown document
function extractMdBlock(text: string): string | null {
  const fenceRe = /```(?:markdown|md|text|)?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(text)) !== null) {
    const block = match[1]?.trim() ?? "";
    if (block.startsWith("#")) return block;
  }
  return null;
}

// ── Agent card ───────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  onEdit,
  onDelete,
}: {
  agent: Agent;
  onEdit: (agent: Agent) => void;
  onDelete: (name: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await onDelete(agent.name);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{agent.name}</span>
            {agent.model && (
              <Badge variant="outline" className="text-xs">
                {agent.model}
              </Badge>
            )}
          </div>
          {agent.description && (
            <p className="text-muted-foreground mt-1 text-sm">
              {agent.description}
            </p>
          )}
          {agent.tool_groups && agent.tool_groups.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {agent.tool_groups.map((group) => (
                <Badge key={group} variant="secondary" className="text-xs">
                  {group}
                </Badge>
              ))}
            </div>
          )}
          {agent.soul && (
            <p className="text-muted-foreground mt-1 text-xs italic">
              Has SOUL.md
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={() => onEdit(agent)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "…" : "Delete"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ── Agent editor (manual + AI) ───────────────────────────────────────────────

function AgentEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Agent | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isNew = !initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [toolGroups, setToolGroups] = useState(
    (initial?.tool_groups ?? []).join(", "),
  );
  const [soul, setSoul] = useState(initial?.soul ?? "");
  const [aiMode, setAiMode] = useState(false);
  const [pendingBlock, setPendingBlock] = useState<string | null>(null);

  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const saving = createAgent.isPending || updateAgent.isPending;

  function handleSoulBlock(block: string) {
    const extracted = extractMdBlock(block);
    if (extracted) setPendingBlock(extracted);
  }

  function applyBlock() {
    if (!pendingBlock) return;
    setSoul(pendingBlock);
    setPendingBlock(null);
    toast.success("SOUL.md content applied from AI response");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const groups = toolGroups
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      if (initial) {
        await updateAgent.mutateAsync({
          name: initial.name,
          request: {
            description: description || null,
            model: model || null,
            tool_groups: groups.length ? groups : null,
            soul: soul || null,
          },
        });
        toast.success(`Agent "${initial.name}" updated`);
      } else {
        await createAgent.mutateAsync({
          name: name.trim(),
          description: description || undefined,
          model: model || null,
          tool_groups: groups.length ? groups : null,
          soul: soul || undefined,
        });
        toast.success(`Agent "${name.trim()}" created`);
      }
      onSave();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save agent");
    }
  }

  return (
    <Card className="overflow-hidden p-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="font-semibold">
          {isNew ? "Create New Agent" : `Edit "${initial.name}"`}
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant={aiMode ? "default" : "outline"}
            size="sm"
            onClick={() => setAiMode(!aiMode)}
          >
            ✨ AI Assist
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            ✕
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className={aiMode ? "flex h-[560px]" : "p-5"}>
        {/* AI chat pane */}
        {aiMode && (
          <div className="flex w-1/2 flex-col border-r">
            <div className="border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
              AI Assistant — SOUL.md
            </div>
            {pendingBlock && (
              <div className="flex items-center justify-between border-b bg-green-50 px-3 py-2 text-xs dark:bg-green-950/30">
                <span className="text-green-700 dark:text-green-300">
                  AI generated a SOUL.md block
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs"
                  onClick={applyBlock}
                >
                  Apply →
                </Button>
              </div>
            )}
            <DashboardChat
              className="flex-1"
              greeting="Describe the agent you want to create and I'll write the SOUL.md for you."
              systemHint={SOUL_CREATOR_HINT}
              onSkillBlock={handleSoulBlock}
              inputPlaceholder="Describe your agent's personality and purpose…"
            />
          </div>
        )}

        {/* Form pane */}
        <div className={aiMode ? "flex w-1/2 flex-col overflow-y-auto p-4" : "flex flex-col gap-3"}>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3"
            id="agent-form"
          >
            {isNew && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Name *</label>
                <Input
                  placeholder="my-agent (letters, digits, hyphens)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus={!aiMode}
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="What this agent specializes in"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Model override</label>
              <Input
                placeholder="Leave blank to use default model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Tool groups{" "}
                <span className="text-muted-foreground font-normal">
                  (comma-separated)
                </span>
              </label>
              <Input
                placeholder="web, bash, file:read"
                value={toolGroups}
                onChange={(e) => setToolGroups(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">SOUL.md</label>
              <textarea
                className="border-input bg-background ring-offset-background focus-visible:ring-ring min-h-0 rounded-md border px-3 py-2 font-mono text-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
                style={aiMode ? { height: "200px" } : { height: "160px" }}
                placeholder={"# Agent Name\n\nPersonality, instructions, and guardrails…"}
                value={soul}
                onChange={(e) => setSoul(e.target.value)}
                spellCheck={false}
              />
              <p className="text-muted-foreground text-xs">
                Agent personality and behavioral instructions. Use ✨ AI Assist
                to generate.
              </p>
            </div>
          </form>

          <div className="mt-auto flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="agent-form"
              disabled={saving || (isNew && !name.trim())}
            >
              {saving ? "Saving…" : isNew ? "Create Agent" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Agents tab ───────────────────────────────────────────────────────────────

function AgentsTab() {
  const { agents, isLoading, error } = useAgents();
  const deleteAgent = useDeleteAgent();
  const [editing, setEditing] = useState<Agent | null | "new">(null);

  async function handleDelete(name: string) {
    try {
      await deleteAgent.mutateAsync(name);
      toast.success(`Agent "${name}" deleted`);
      if (editing !== "new" && editing?.name === name) setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete agent");
    }
  }

  return (
    <>
      <ErrorBanner error={error} />

      {editing !== null ? (
        <div className="mb-4">
          <AgentEditor
            initial={editing === "new" ? null : editing}
            onSave={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : (
        <div className="mb-4">
          <Button onClick={() => setEditing("new")}>+ New Agent</Button>
        </div>
      )}

      <ScrollArea className="h-[calc(100vh-380px)]">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No custom agents yet.</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Create an agent to give it a unique personality and tool access.
              Use ✨ AI Assist to write the SOUL.md.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {agents.map((agent) => (
              <AgentCard
                key={agent.name}
                agent={agent}
                onEdit={(a) => setEditing(a)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </>
  );
}

// ── User Profile tab ─────────────────────────────────────────────────────────

function UserProfileTab() {
  const { profile, isLoading, error } = useUserProfile();
  const updateProfile = useUpdateUserProfile();
  const [content, setContent] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [pendingBlock, setPendingBlock] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (profile !== null && !dirty) {
      setContent(profile.content ?? "");
    }
  }, [profile, dirty]);

  function handleProfileBlock(block: string) {
    const extracted = extractMdBlock(block);
    if (extracted) setPendingBlock(extracted);
  }

  function applyBlock() {
    if (!pendingBlock) return;
    setContent(pendingBlock);
    setDirty(true);
    setPendingBlock(null);
    toast.success("USER.md content applied from AI response");
  }

  async function handleSave() {
    try {
      await updateProfile.mutateAsync(content);
      setDirty(false);
      toast.success("User profile saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    }
  }

  return (
    <>
      <ErrorBanner error={error} />

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="font-semibold">USER.md</h3>
            <p className="text-muted-foreground text-xs">
              Injected into every custom agent — describes your background and
              preferences.
            </p>
          </div>
          <Button
            variant={aiMode ? "default" : "outline"}
            size="sm"
            onClick={() => setAiMode(!aiMode)}
          >
            ✨ AI Assist
          </Button>
        </div>

        <div className={aiMode ? "flex h-[480px]" : "p-4"}>
          {/* AI pane */}
          {aiMode && (
            <div className="flex w-1/2 flex-col border-r">
              <div className="border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
                AI Assistant — USER.md
              </div>
              {pendingBlock && (
                <div className="flex items-center justify-between border-b bg-green-50 px-3 py-2 text-xs dark:bg-green-950/30">
                  <span className="text-green-700 dark:text-green-300">
                    AI generated a USER.md block
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs"
                    onClick={applyBlock}
                  >
                    Apply →
                  </Button>
                </div>
              )}
              <DashboardChat
                className="flex-1"
                greeting="Tell me about yourself and I'll write a USER.md profile for you."
                systemHint={PROFILE_CREATOR_HINT}
                onSkillBlock={handleProfileBlock}
                inputPlaceholder="Describe your background, expertise, and preferences…"
              />
            </div>
          )}

          {/* Editor pane */}
          <div className={aiMode ? "flex w-1/2 flex-col p-4" : "flex flex-col gap-3"}>
            {isLoading ? (
              <div className="h-40 animate-pulse rounded-lg bg-muted" />
            ) : (
              <textarea
                className="border-input bg-background ring-offset-background focus-visible:ring-ring min-h-0 flex-1 rounded-md border px-3 py-2 font-mono text-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
                style={aiMode ? { height: "340px" } : { height: "240px" }}
                placeholder={"# About Me\n\nDescribe your background, expertise, and preferences…"}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setDirty(true);
                }}
                spellCheck={false}
              />
            )}
            <div className="flex justify-end pt-1">
              <Button
                onClick={handleSave}
                disabled={updateProfile.isPending || !dirty}
              >
                {updateProfile.isPending ? "Saving…" : "Save Profile"}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const { agents } = useAgents();
  const [activeTab, setActiveTab] = useState<"agents" | "profile">("agents");

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Agents</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {agents.length} custom agent{agents.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        <Button
          variant={activeTab === "agents" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("agents")}
        >
          Custom Agents ({agents.length})
        </Button>
        <Button
          variant={activeTab === "profile" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("profile")}
        >
          User Profile
        </Button>
      </div>

      <Separator className="mb-6" />

      {activeTab === "agents" && <AgentsTab />}
      {activeTab === "profile" && <UserProfileTab />}
    </div>
  );
}