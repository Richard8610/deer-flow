"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { updateMCPConfig } from "@/core/mcp/api";
import { useEnableMCPServer, useMCPConfig } from "@/core/mcp/hooks";
import type { MCPServerConfig } from "@/core/mcp/types";

import { ErrorBanner } from "../_components/backend-offline-banner";

function ServerCard({
  name,
  config,
  onToggle,
  toggling,
}: {
  name: string;
  config: MCPServerConfig;
  onToggle: (enabled: boolean) => void;
  toggling: boolean;
}) {
  const type = (config as Record<string, unknown>).type as string | undefined;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{name}</span>
            {type && (
              <Badge variant="outline" className="shrink-0 text-xs">
                {type}
              </Badge>
            )}
          </div>
          {config.description && (
            <p className="text-muted-foreground mt-1 truncate text-sm">
              {config.description}
            </p>
          )}
        </div>
        <Switch
          checked={config.enabled}
          onCheckedChange={onToggle}
          disabled={toggling}
          aria-label={`Toggle ${name}`}
        />
      </div>
    </Card>
  );
}

function AddServerDialog({
  onAdd,
}: {
  onAdd: (name: string, config: MCPServerConfig) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!name.trim() || !url.trim()) return;
    setSaving(true);
    try {
      await onAdd(name.trim(), {
        enabled: true,
        description: description.trim(),
        type: "sse",
        url: url.trim(),
      } as MCPServerConfig);
      setName("");
      setUrl("");
      setDescription("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        + Add Server
      </Button>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="mb-3 font-medium">Add MCP Server</h3>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Server Name</label>
          <Input
            placeholder="my-server"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">URL (SSE / HTTP)</label>
          <Input
            placeholder="http://localhost:8000/sse"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Description (optional)</label>
          <Input
            placeholder="What this server provides"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={!name.trim() || !url.trim() || saving}
          >
            {saving ? "Adding…" : "Add"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function MCPPage() {
  const { config, isLoading, error } = useMCPConfig();
  const enableMutation = useEnableMCPServer();
  const queryClient = useQueryClient();
  const [togglingServer, setTogglingServer] = useState<string | null>(null);

  async function handleToggle(serverName: string, enabled: boolean) {
    setTogglingServer(serverName);
    try {
      await enableMutation.mutateAsync({ serverName, enabled });
      toast.success(`${serverName} ${enabled ? "enabled" : "disabled"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update server");
    } finally {
      setTogglingServer(null);
    }
  }

  async function handleAddServer(name: string, serverConfig: MCPServerConfig) {
    if (!config) return;
    try {
      await updateMCPConfig({
        mcp_servers: { ...config.mcp_servers, [name]: serverConfig },
      });
      await queryClient.invalidateQueries({ queryKey: ["mcpConfig"] });
      toast.success(`Server "${name}" added`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add server");
      throw err;
    }
  }

  const servers = config ? Object.entries(config.mcp_servers) : [];
  const enabledCount = servers.filter(([, s]) => s.enabled).length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">MCP Servers</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {isLoading
              ? "Loading…"
              : `${servers.length} server${servers.length !== 1 ? "s" : ""} · ${enabledCount} enabled`}
          </p>
        </div>
      </div>

      <ErrorBanner error={error} />

      <div className="mb-6">
        <AddServerDialog onAdd={handleAddServer} />
      </div>

      <Separator className="mb-6" />

      <ScrollArea className="h-[calc(100vh-280px)]">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : servers.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No MCP servers configured yet.</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Add a server above to extend your agent&apos;s capabilities.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {servers.map(([name, serverConfig]) => (
              <ServerCard
                key={name}
                name={name}
                config={serverConfig}
                onToggle={(enabled) => handleToggle(name, enabled)}
                toggling={togglingServer === name}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}