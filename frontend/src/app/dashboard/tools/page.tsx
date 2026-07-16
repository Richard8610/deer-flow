"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useCreateTool, useDeleteTool, useToolGroups, useTools, useUpdateTool } from "@/core/tools/hooks";
import type { Tool } from "@/core/tools/types";

import { ErrorBanner } from "../_components/backend-offline-banner";
import { DashboardChat } from "../_components/dashboard-chat";

const TOOL_CREATOR_HINT =
  "You are helping the user create a DeerFlow tool configuration. " +
  "When asked to create or describe a tool, respond with a JSON block containing the fields: " +
  "'name' (snake_case), 'group' (e.g. web, bash, file:read, file:write), 'use' (Python import path like 'module.path:variable_name'), " +
  "and optionally 'extras' (object with additional config like max_results, timeout). " +
  "Example: ```json\\n{\"name\": \"web_search\", \"group\": \"web\", \"use\": \"deerflow.community.ddg_search.tools:web_search_tool\", \"extras\": {\"max_results\": 5}}\\n``` " +
  "User request:";

function extrasToString(extras: Record<string, unknown>): string {
  if (!extras || Object.keys(extras).length === 0) return "";
  return JSON.stringify(extras, null, 2);
}

function parseExtras(str: string): Record<string, unknown> {
  if (!str.trim()) return {};
  try {
    const parsed = JSON.parse(str) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

// ── Tool Card ────────────────────────────────────────────────────────────────

function ToolCard({
  tool,
  onEdit,
  onDelete,
}: {
  tool: Tool;
  onEdit: (tool: Tool) => void;
  onDelete: (name: string) => void;
}) {
  const extrasEntries = Object.entries(tool.extras ?? {});
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{tool.name}</span>
            <Badge variant="secondary" className="text-xs">
              {tool.group}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 truncate font-mono text-xs">
            {tool.use}
          </p>
          {extrasEntries.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2">
              {extrasEntries.map(([k, v]) => (
                <span key={k} className="text-muted-foreground text-xs">
                  <span className="font-medium">{k}:</span> {String(v)}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onEdit(tool)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(tool.name)}
          >
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ── Tool Editor ──────────────────────────────────────────────────────────────

function ToolEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Tool | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isNew = !initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [group, setGroup] = useState(initial?.group ?? "");
  const [use, setUse] = useState(initial?.use ?? "");
  const [extrasStr, setExtrasStr] = useState(
    initial ? extrasToString(initial.extras) : "",
  );
  const [aiMode, setAiMode] = useState(false);
  const [pendingJson, setPendingJson] = useState<Record<string, unknown> | null>(null);
  const [extrasError, setExtrasError] = useState("");

  const createMutation = useCreateTool();
  const updateMutation = useUpdateTool();
  const saving = createMutation.isPending || updateMutation.isPending;

  function handleToolJson(json: Record<string, unknown>) {
    setPendingJson(json);
  }

  function applyJson() {
    if (!pendingJson) return;
    const pName = pendingJson.name;
    const pGroup = pendingJson.group;
    const pUse = pendingJson.use;
    if (isNew && typeof pName === "string") setName(pName);
    if (typeof pGroup === "string") setGroup(pGroup);
    if (typeof pUse === "string") setUse(pUse);
    if (pendingJson.extras && typeof pendingJson.extras === "object") {
      setExtrasStr(extrasToString(pendingJson.extras as Record<string, unknown>));
    }
    setPendingJson(null);
    toast.success("Tool config applied from AI response");
  }

  function validateExtras(str: string): boolean {
    if (!str.trim()) {
      setExtrasError("");
      return true;
    }
    try {
      const parsed = JSON.parse(str) as unknown;
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        setExtrasError("Must be a JSON object");
        return false;
      }
      setExtrasError("");
      return true;
    } catch {
      setExtrasError("Invalid JSON");
      return false;
    }
  }

  async function handleSave() {
    if (!name.trim() || !group.trim() || !use.trim()) return;
    if (!validateExtras(extrasStr)) return;
    const extras = parseExtras(extrasStr);
    try {
      if (isNew) {
        await createMutation.mutateAsync({ name: name.trim(), group: group.trim(), use: use.trim(), extras });
        toast.success(`Tool "${name.trim()}" created`);
      } else {
        await updateMutation.mutateAsync({
          name: initial.name,
          request: { group: group.trim(), use: use.trim(), extras },
        });
        toast.success(`Tool "${initial.name}" updated`);
      }
      onSave();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save tool");
    }
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="font-semibold">
          {isNew ? "Add New Tool" : `Edit "${initial.name}"`}
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

      <div className={aiMode ? "flex h-[500px]" : "p-5"}>
        {aiMode && (
          <div className="flex w-1/2 flex-col border-r">
            <div className="border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
              AI Assistant
            </div>
            {pendingJson && (
              <div className="flex items-center justify-between border-b bg-green-50 px-3 py-2 text-xs dark:bg-green-950/30">
                <span className="text-green-700 dark:text-green-300">
                  AI generated a tool config
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs"
                  onClick={applyJson}
                >
                  Apply →
                </Button>
              </div>
            )}
            <DashboardChat
              className="flex-1"
              greeting="Describe the tool you want to add and I'll generate its config."
              systemHint={TOOL_CREATOR_HINT}
              onToolJson={handleToolJson}
              inputPlaceholder="Describe the tool…"
            />
          </div>
        )}

        <div className={aiMode ? "flex w-1/2 flex-col gap-3 overflow-y-auto p-4" : "flex flex-col gap-3"}>
          {isNew && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Tool name *</label>
              <Input
                placeholder="my_tool (snake_case)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus={!aiMode}
              />
              <p className="text-muted-foreground text-xs">
                Lowercase letters, digits, and underscores.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Group *</label>
            <Input
              placeholder="e.g. web, bash, file:read"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Use (import path) *</label>
            <Input
              placeholder="deerflow.community.example:my_tool"
              value={use}
              onChange={(e) => setUse(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-muted-foreground text-xs">
              Python module path to the tool variable, e.g.{" "}
              <code className="bg-muted rounded px-1">module.path:variable</code>
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Extra config (JSON)</label>
            <textarea
              className="border-input bg-background ring-offset-background focus-visible:ring-ring rounded-md border px-3 py-2 font-mono text-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
              style={{ height: "100px" }}
              placeholder='{"max_results": 5}'
              value={extrasStr}
              onChange={(e) => {
                setExtrasStr(e.target.value);
                validateExtras(e.target.value);
              }}
              spellCheck={false}
            />
            {extrasError && (
              <p className="text-destructive text-xs">{extrasError}</p>
            )}
            <p className="text-muted-foreground text-xs">
              Optional extra parameters for the tool.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !name.trim() || !group.trim() || !use.trim() || !!extrasError}
            >
              {saving ? "Saving…" : isNew ? "Add Tool" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ToolsPage() {
  const { tools, isLoading, error } = useTools();
  const { toolGroups } = useToolGroups();
  const deleteMutation = useDeleteTool();
  const [editing, setEditing] = useState<Tool | null | "new">(null);
  const [search, setSearch] = useState("");

  async function handleDelete(name: string) {
    if (!confirm(`Delete tool "${name}"? This will update config.yaml.`)) return;
    try {
      await deleteMutation.mutateAsync(name);
      toast.success(`Tool "${name}" deleted`);
      if (editing !== "new" && editing?.name === name) setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete tool");
    }
  }

  const filtered = tools.filter(
    (t) =>
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.group.toLowerCase().includes(search.toLowerCase()) ||
      t.use.toLowerCase().includes(search.toLowerCase()),
  );

  const grouped = filtered.reduce<Record<string, Tool[]>>((acc, tool) => {
    const g = tool.group || "other";
    (acc[g] ??= []).push(tool);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tools</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {isLoading
              ? "Loading…"
              : `${tools.length} tool${tools.length !== 1 ? "s" : ""} · ${toolGroups.length} group${toolGroups.length !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      <ErrorBanner error={error} />

      {editing !== null ? (
        <div className="mb-6">
          <ToolEditor
            initial={editing === "new" ? null : editing}
            onSave={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : (
        <div className="mb-4">
          <Button onClick={() => setEditing("new")}>+ Add Tool</Button>
        </div>
      )}

      <Separator className="mb-6" />

      <div className="mb-4">
        <Input
          placeholder="Search tools…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <ScrollArea className="h-[calc(100vh-380px)]">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">
              {search ? "No tools match your search." : "No tools configured."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {Object.entries(grouped).map(([groupName, groupTools]) => (
              <div key={groupName}>
                <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
                  {groupName}
                </h2>
                <div className="flex flex-col gap-2">
                  {groupTools.map((tool) => (
                    <ToolCard
                      key={tool.name}
                      tool={tool}
                      onEdit={(t) => setEditing(t)}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
