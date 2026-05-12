"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  useClearMemory,
  useCreateMemoryFact,
  useDeleteMemoryFact,
  useMemory,
} from "@/core/memory/hooks";
import type { MemoryFact } from "@/core/memory/types";

import { ErrorBanner } from "../_components/backend-offline-banner";

function ContextSection({
  title,
  summary,
  updatedAt,
}: {
  title: string;
  summary: string;
  updatedAt: string;
}) {
  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {updatedAt && (
          <span className="text-muted-foreground text-xs">
            {new Date(updatedAt).toLocaleDateString()}
          </span>
        )}
      </div>
      <p className="text-muted-foreground text-sm leading-relaxed">
        {summary || <em className="opacity-60">No data yet</em>}
      </p>
    </Card>
  );
}

function FactRow({
  fact,
  onDelete,
}: {
  fact: MemoryFact;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      onDelete(fact.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{fact.content}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {fact.category}
          </Badge>
          <span className="text-muted-foreground text-xs">
            {Math.round(fact.confidence * 100)}% confidence
          </span>
          <span className="text-muted-foreground text-xs">
            {new Date(fact.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive shrink-0"
        onClick={handleDelete}
        disabled={deleting}
      >
        ✕
      </Button>
    </div>
  );
}

function AddFactForm() {
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const createFact = useCreateMemoryFact();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    try {
      await createFact.mutateAsync({
        content: content.trim(),
        category: category.trim() || "general",
        confidence: 1,
      });
      setContent("");
      toast.success("Fact added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add fact");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        placeholder="Add a new fact…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="flex-1"
      />
      <Input
        placeholder="Category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="w-32"
      />
      <Button type="submit" disabled={!content.trim() || createFact.isPending}>
        {createFact.isPending ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}

export default function KnowledgeBasePage() {
  const { memory, isLoading, error } = useMemory();
  const clearMutation = useClearMemory();
  const deleteFact = useDeleteMemoryFact();
  const [activeTab, setActiveTab] = useState<"facts" | "context">("facts");

  async function handleDeleteFact(id: string) {
    try {
      await deleteFact.mutateAsync(id);
      toast.success("Fact deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete fact");
    }
  }

  async function handleClear() {
    if (!confirm("Clear all memory? This cannot be undone.")) return;
    try {
      await clearMutation.mutateAsync();
      toast.success("Memory cleared");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear memory");
    }
  }

  const facts = memory?.facts ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {isLoading
              ? "Loading…"
              : `${facts.length} fact${facts.length !== 1 ? "s" : ""} stored`}
          </p>
        </div>
        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={handleClear}
          disabled={clearMutation.isPending || isLoading}
        >
          {clearMutation.isPending ? "Clearing…" : "Clear All"}
        </Button>
      </div>

      <ErrorBanner error={error} />

      <div className="mb-4 flex gap-2">
        <Button
          variant={activeTab === "facts" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("facts")}
        >
          Facts ({facts.length})
        </Button>
        <Button
          variant={activeTab === "context" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("context")}
        >
          Context Summaries
        </Button>
      </div>

      <Separator className="mb-6" />

      {activeTab === "facts" && (
        <>
          <div className="mb-4">
            <AddFactForm />
          </div>
          <ScrollArea className="h-[calc(100vh-360px)]">
            {isLoading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-md bg-muted"
                  />
                ))}
              </div>
            ) : facts.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">No facts stored yet.</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Facts are automatically extracted from conversations.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {facts.map((fact) => (
                  <FactRow
                    key={fact.id}
                    fact={fact}
                    onDelete={handleDeleteFact}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </>
      )}

      {activeTab === "context" && (
        <ScrollArea className="h-[calc(100vh-320px)]">
          {isLoading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-lg bg-muted"
                />
              ))}
            </div>
          ) : !memory ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              No memory data available.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <ContextSection
                title="Work Context"
                summary={memory.user.workContext.summary}
                updatedAt={memory.user.workContext.updatedAt}
              />
              <ContextSection
                title="Personal Context"
                summary={memory.user.personalContext.summary}
                updatedAt={memory.user.personalContext.updatedAt}
              />
              <ContextSection
                title="Top of Mind"
                summary={memory.user.topOfMind.summary}
                updatedAt={memory.user.topOfMind.updatedAt}
              />
              <ContextSection
                title="Recent History"
                summary={memory.history.recentMonths.summary}
                updatedAt={memory.history.recentMonths.updatedAt}
              />
              <ContextSection
                title="Earlier Context"
                summary={memory.history.earlierContext.summary}
                updatedAt={memory.history.earlierContext.updatedAt}
              />
              <ContextSection
                title="Long-term Background"
                summary={memory.history.longTermBackground.summary}
                updatedAt={memory.history.longTermBackground.updatedAt}
              />
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  );
}