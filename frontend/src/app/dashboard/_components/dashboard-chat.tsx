"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetch as fetchWithAuth } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";
import { cn } from "@/lib/utils";

type Role = "human" | "ai";

interface ChatMessage {
  role: Role;
  text: string;
}

// Pull the first fenced code block whose content starts with "---" (YAML frontmatter)
export function extractSkillMd(text: string): string | null {
  const fenceRe = /```(?:yaml|markdown|md|)?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(text)) !== null) {
    const block = match[1]?.trim() ?? "";
    if (block.startsWith("---")) return block;
  }
  return null;
}

// Pull the first fenced JSON code block that looks like a tool config (has "name" and "use")
export function extractToolJson(text: string): Record<string, unknown> | null {
  const fenceRe = /```(?:json)?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(text)) !== null) {
    const block = match[1]?.trim() ?? "";
    try {
      const parsed = JSON.parse(block) as unknown;
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed) &&
        "name" in parsed &&
        "use" in parsed
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // not valid JSON — skip
    }
  }
  return null;
}

interface DashboardChatProps {
  /** Shown as the first assistant bubble to guide the user. */
  greeting?: string;
  /** If provided, this text is prepended to every user message sent to the LLM. */
  systemHint?: string;
  /** Called whenever an AI response contains a SKILL.md-looking code block. */
  onSkillBlock?: (content: string) => void;
  /** Called whenever an AI response contains a JSON tool-config block. */
  onToolJson?: (json: Record<string, unknown>) => void;
  className?: string;
  inputPlaceholder?: string;
}

export function DashboardChat({
  greeting,
  systemHint,
  onSkillBlock,
  onToolJson,
  className,
  inputPlaceholder = "Type a message…",
}: DashboardChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const lastAiText = messages.filter((m) => m.role === "ai").at(-1)?.text ?? "";

  // Notify parent whenever the latest AI message has a SKILL.md block
  useEffect(() => {
    if (!onSkillBlock || !lastAiText) return;
    const block = extractSkillMd(lastAiText);
    if (block) onSkillBlock(block);
  }, [lastAiText, onSkillBlock]);

  // Notify parent whenever the latest AI message has a tool JSON block
  useEffect(() => {
    if (!onToolJson || !lastAiText) return;
    const json = extractToolJson(lastAiText);
    if (json) onToolJson(json);
  }, [lastAiText, onToolJson]);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoading]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");

    setMessages((prev) => [...prev, { role: "human", text }]);
    setMessages((prev) => [...prev, { role: "ai", text: "" }]);
    setIsLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const base = getBackendBaseURL();
      const res = await fetchWithAuth(`${base}/api/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, system_hint: systemHint ?? null }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.text().catch(() => res.statusText);
        throw new Error(err);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;
          try {
            const chunk = JSON.parse(payload) as { text?: string; error?: string };
            if (chunk.error) throw new Error(chunk.error);
            if (chunk.text) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "ai") {
                  updated[updated.length - 1] = { role: "ai", text: last.text + chunk.text };
                }
                return updated;
              });
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const msg = err instanceof Error ? err.message : "Request failed";
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "ai" && last.text === "") {
            updated[updated.length - 1] = { role: "ai", text: `Error: ${msg}` };
          }
          return updated;
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, systemHint]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <ScrollArea className="min-h-0 flex-1 px-4 py-4">
        {greeting && messages.length === 0 && (
          <Bubble role="ai" text={greeting} />
        )}
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.text} loading={isLoading && i === messages.length - 1 && m.role === "ai" && m.text === ""} />
        ))}
        <div ref={bottomRef} />
      </ScrollArea>

      <div className="border-t p-3">
        <div className="flex gap-2">
          <textarea
            className="border-input bg-background ring-offset-background focus-visible:ring-ring min-h-[44px] flex-1 resize-none rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
            placeholder={inputPlaceholder}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <Button
            onClick={() => void handleSend()}
            disabled={!input.trim() || isLoading}
            className="self-end"
          >
            Send
          </Button>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Shift+Enter for newline · Enter to send
        </p>
      </div>
    </div>
  );
}

function Bubble({
  role,
  text,
  loading,
}: {
  role: Role;
  text: string;
  loading?: boolean;
}) {
  return (
    <div
      className={cn("mb-3 flex", role === "human" ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
          role === "human"
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted rounded-bl-sm",
        )}
      >
        {loading ? (
          <span className="inline-flex gap-1">
            <span className="animate-bounce [animation-delay:-0.3s]">·</span>
            <span className="animate-bounce [animation-delay:-0.15s]">·</span>
            <span className="animate-bounce">·</span>
          </span>
        ) : (
          text
        )}
      </div>
    </div>
  );
}