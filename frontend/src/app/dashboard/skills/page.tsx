"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  useCreateCustomSkill,
  useCustomSkills,
  useDeleteCustomSkill,
  useEnableSkill,
  useSkills,
  useUpdateCustomSkill,
} from "@/core/skills/hooks";
import type { CustomSkill, Skill } from "@/core/skills/type";

import { ErrorBanner } from "../_components/backend-offline-banner";
import { DashboardChat } from "../_components/dashboard-chat";

const SKILL_MD_TEMPLATE = (name: string) => `---
name: ${name}
description: What this skill does
license: MIT
allowed-tools:
  - bash
---

# ${name}

Describe what this skill enables the agent to do.

## Instructions

Provide any specific instructions or context for the agent here.
`;

const SKILL_CREATOR_HINT =
  "You are helping the user create a DeerFlow SKILL.md file. " +
  "When asked to create or update a skill, always include the complete SKILL.md content in a fenced code block. " +
  "Valid frontmatter keys are: name (hyphen-case), description, license, allowed-tools, version, author, metadata, compatibility. " +
  "Do NOT include a 'category' key. The name in the frontmatter must match the skill name field. " +
  "User request:";

// ── Shared skill card ────────────────────────────────────────────────────────

function SkillCard({
  skill,
  onToggle,
  toggling,
}: {
  skill: Skill;
  onToggle: (enabled: boolean) => void;
  toggling: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{skill.name}</span>
            <Badge variant="secondary" className="text-xs">
              {skill.category}
            </Badge>
            {skill.license && (
              <Badge variant="outline" className="text-xs">
                {skill.license}
              </Badge>
            )}
          </div>
          {skill.description && (
            <p className="text-muted-foreground mt-1 text-sm">
              {skill.description}
            </p>
          )}
        </div>
        <Switch
          checked={skill.enabled}
          onCheckedChange={onToggle}
          disabled={toggling}
          aria-label={`Toggle ${skill.name}`}
        />
      </div>
    </Card>
  );
}

// ── Custom skill card ────────────────────────────────────────────────────────

function CustomSkillCard({
  skill,
  onEdit,
  onDelete,
  onToggle,
  toggling,
}: {
  skill: CustomSkill;
  onEdit: (skill: CustomSkill) => void;
  onDelete: (name: string) => void;
  onToggle: (enabled: boolean) => void;
  toggling: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{skill.name}</span>
            <Badge variant="secondary" className="text-xs">custom</Badge>
            {skill.license && (
              <Badge variant="outline" className="text-xs">{skill.license}</Badge>
            )}
          </div>
          {skill.description && (
            <p className="text-muted-foreground mt-1 text-sm">{skill.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Switch
            checked={skill.enabled}
            onCheckedChange={onToggle}
            disabled={toggling}
            aria-label={`Toggle ${skill.name}`}
          />
          <Button variant="ghost" size="sm" onClick={() => onEdit(skill)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(skill.name)}
          >
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ── Skill editor (manual + AI) ───────────────────────────────────────────────

function SkillEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: CustomSkill | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isNew = !initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [content, setContent] = useState(
    initial?.content ?? SKILL_MD_TEMPLATE("my-skill"),
  );
  const [aiMode, setAiMode] = useState(false);
  const [templateTouched, setTemplateTouched] = useState(false);
  const [pendingBlock, setPendingBlock] = useState<string | null>(null);

  const createMutation = useCreateCustomSkill();
  const updateMutation = useUpdateCustomSkill();
  const saving = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (isNew && !templateTouched && name) {
      setContent(SKILL_MD_TEMPLATE(name));
    }
  }, [isNew, name, templateTouched]);

  // When AI returns a skill block, show an "Apply" button
  function handleSkillBlock(block: string) {
    setPendingBlock(block);
  }

  function applyBlock() {
    if (!pendingBlock) return;
    // Try to extract the name from the block frontmatter
    const nameMatch = /^name:\s*(.+)$/m.exec(pendingBlock);
    if (nameMatch?.[1] && isNew) {
      const extractedName = nameMatch[1].trim();
      setName(extractedName);
    }
    setContent(pendingBlock);
    setTemplateTouched(true);
    setPendingBlock(null);
    toast.success("SKILL.md content applied from AI response");
  }

  async function handleSave() {
    if (!name.trim()) return;
    try {
      if (isNew) {
        await createMutation.mutateAsync({ name: name.trim(), content });
        toast.success(`Skill "${name.trim()}" created`);
      } else {
        await updateMutation.mutateAsync({ name: initial.name, content });
        toast.success(`Skill "${initial.name}" updated`);
      }
      onSave();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save skill");
    }
  }

  return (
    <Card className="p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="font-semibold">
          {isNew ? "Create New Skill" : `Edit "${initial.name}"`}
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant={aiMode ? "default" : "outline"}
            size="sm"
            onClick={() => setAiMode(!aiMode)}
          >
            ✨ AI Assist
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>✕</Button>
        </div>
      </div>

      {/* Body: side-by-side when AI mode is on */}
      <div className={aiMode ? "flex h-[520px]" : "p-5"}>

        {/* AI chat pane */}
        {aiMode && (
          <div className="flex w-1/2 flex-col border-r">
            <div className="border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
              AI Assistant
            </div>
            {pendingBlock && (
              <div className="flex items-center justify-between border-b bg-green-50 px-3 py-2 text-xs dark:bg-green-950/30">
                <span className="text-green-700 dark:text-green-300">
                  AI generated a SKILL.md block
                </span>
                <Button size="sm" variant="outline" className="h-6 text-xs" onClick={applyBlock}>
                  Apply →
                </Button>
              </div>
            )}
            <DashboardChat
              className="flex-1"
              greeting="Describe the skill you want to create and I'll write the SKILL.md for you."
              systemHint={SKILL_CREATOR_HINT}
              onSkillBlock={handleSkillBlock}
              inputPlaceholder="Describe your skill…"
            />
          </div>
        )}

        {/* Editor pane */}
        <div className={aiMode ? "flex w-1/2 flex-col p-4" : "flex flex-col gap-3"}>
          {isNew && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Skill name *</label>
              <Input
                placeholder="my-skill (hyphen-case)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus={!aiMode}
              />
              <p className="text-muted-foreground text-xs">
                Lowercase letters, digits, and hyphens. Max 64 chars.
              </p>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            <label className="text-sm font-medium">SKILL.md content</label>
            <textarea
              className="border-input bg-background ring-offset-background focus-visible:ring-ring min-h-0 flex-1 rounded-md border px-3 py-2 font-mono text-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
              style={aiMode ? { height: "320px" } : { height: "260px" }}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (isNew) setTemplateTouched(true);
              }}
              spellCheck={false}
            />
            <p className="text-muted-foreground text-xs">
              The <code className="bg-muted rounded px-1">name</code> frontmatter
              field must match the skill name.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !name.trim() || !content.trim()}
            >
              {saving ? "Saving…" : isNew ? "Create Skill" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── All Skills tab ───────────────────────────────────────────────────────────

function AllSkillsTab() {
  const { skills, isLoading, error } = useSkills();
  const enableMutation = useEnableSkill();
  const [togglingSkill, setTogglingSkill] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function handleToggle(skillName: string, enabled: boolean) {
    setTogglingSkill(skillName);
    try {
      await enableMutation.mutateAsync({ skillName, enabled });
      toast.success(`${skillName} ${enabled ? "enabled" : "disabled"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update skill");
    } finally {
      setTogglingSkill(null);
    }
  }

  const filtered = skills.filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description?.toLowerCase().includes(search.toLowerCase()) ||
      s.category?.toLowerCase().includes(search.toLowerCase()),
  );

  const grouped = filtered.reduce<Record<string, Skill[]>>((acc, skill) => {
    const cat = skill.category || "other";
    (acc[cat] ??= []).push(skill);
    return acc;
  }, {});

  return (
    <>
      <ErrorBanner error={error} />
      <div className="mb-4">
        <Input
          placeholder="Search skills…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <ScrollArea className="h-[calc(100vh-360px)]">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">
              {search ? "No skills match your search." : "No skills available."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {Object.entries(grouped).map(([category, categorySkills]) => (
              <div key={category}>
                <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
                  {category}
                </h2>
                <div className="flex flex-col gap-2">
                  {categorySkills.map((skill) => (
                    <SkillCard
                      key={skill.name}
                      skill={skill}
                      onToggle={(enabled) => handleToggle(skill.name, enabled)}
                      toggling={togglingSkill === skill.name}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </>
  );
}

// ── My Skills tab ────────────────────────────────────────────────────────────

function MySkillsTab() {
  const { customSkills, isLoading, error } = useCustomSkills();
  const enableMutation = useEnableSkill();
  const deleteMutation = useDeleteCustomSkill();
  const [togglingSkill, setTogglingSkill] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomSkill | null | "new">(null);

  async function handleToggle(skillName: string, enabled: boolean) {
    setTogglingSkill(skillName);
    try {
      await enableMutation.mutateAsync({ skillName, enabled });
      toast.success(`${skillName} ${enabled ? "enabled" : "disabled"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update skill");
    } finally {
      setTogglingSkill(null);
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete custom skill "${name}"? This cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync(name);
      toast.success(`Skill "${name}" deleted`);
      if (editing !== "new" && editing?.name === name) setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete skill");
    }
  }

  return (
    <>
      <ErrorBanner error={error} />

      {editing !== null ? (
        <div className="mb-4">
          <SkillEditor
            initial={editing === "new" ? null : editing}
            onSave={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : (
        <div className="mb-4">
          <Button onClick={() => setEditing("new")}>+ Create Skill</Button>
        </div>
      )}

      <ScrollArea className="h-[calc(100vh-380px)]">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : customSkills.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No custom skills yet.</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Create a skill above — or use ✨ AI Assist to generate one.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {customSkills.map((skill) => (
              <CustomSkillCard
                key={skill.name}
                skill={skill}
                onEdit={(s) => setEditing(s)}
                onDelete={handleDelete}
                onToggle={(enabled) => handleToggle(skill.name, enabled)}
                toggling={togglingSkill === skill.name}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SkillsPage() {
  const { skills } = useSkills();
  const { customSkills } = useCustomSkills();
  const [activeTab, setActiveTab] = useState<"all" | "custom">("all");

  const enabledCount = skills.filter((s) => s.enabled).length;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Skills</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {skills.length} skill{skills.length !== 1 ? "s" : ""} · {enabledCount} enabled ·{" "}
          {customSkills.length} custom
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        <Button
          variant={activeTab === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("all")}
        >
          All Skills ({skills.length})
        </Button>
        <Button
          variant={activeTab === "custom" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("custom")}
        >
          My Custom Skills ({customSkills.length})
        </Button>
      </div>

      <Separator className="mb-6" />

      {activeTab === "all" && <AllSkillsTab />}
      {activeTab === "custom" && <MySkillsTab />}
    </div>
  );
}