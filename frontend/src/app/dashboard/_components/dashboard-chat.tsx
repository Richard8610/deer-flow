"use client";

import { useStream } from "@langchain/langgraph-sdk/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getAPIClient } from "@/core/api";
import type { AgentThreadState } from "@/core/threads/types";
import { cn } from "@/lib/utils";

type Role = "human" | "ai";

interface ChatMessage {
  role: Role;
  text: string;
}

// Extract text from a LangGraph message content field (string or content-part array)
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (p): p is { type: "text"; text: string } =>
        typeof p === "object" && p !== null && "type" in p && p.type === "text",
    )
    .map((p) => p.text)
    .join("");
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

interface DashboardChatProps {
  /** Shown as the first assistant bubble to guide the user. */
  greeting?: string;
  /** If provided, this text is prepended to every user message sent to the agent. */
  systemHint?: string;
  /** Called whenever an AI response contains a SKILL.md-looking code block. */
  onSkillBlock?: (content: string) => void;
  className?: string;
  inputPlaceholder?: string;
}

export function DashboardChat({
  greeting,
  systemHint,
  onSkillBlock,
  className,
  inputPlaceholder = "Type a message…",
}: DashboardChatProps) {
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const thread = useStream<AgentThreadState>({
    client: getAPIClient(),
    assistantId: "lead_agent",
    threadId,
    onCreated(meta) {
      setThreadId(meta.thread_id);
    },
  });

  // Derive a clean message list from the stream state
  const messages: ChatMessage[] = (thread.messages ?? [])
    .filter((m) => m.type === "human" || m.type === "ai")
    .filter((m) => {
      if (m.type !== "ai") return true;
      const text = extractText(m.content);
      return text.trim().length > 0;
    })
    .map((m) => ({
      role: m.type as Role,
      text: extractText(m.content),
    }));

  // Notify parent whenever the latest AI message has a SKILL.md block
  const lastAiText = messages.filter((m) => m.role === "ai").at(-1)?.text ?? "";
  useEffect(() => {
    if (!onSkillBlock || !lastAiText) return;
    const block = extractSkillMd(lastAiText);
    if (block) onSkillBlock(block);
  }, [lastAiText, onSkillBlock]);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, thread.isLoading]);

  function handleSend() {
    const text = input.trim();
    if (!text || thread.isLoading) return;
    setInput("");
    const fullText = systemHint ? `${systemHint}\n\n${text}` : text;
    void thread.submit({
      messages: [
        {
          type: "human",
          content: [{ type: "text", text: fullText }],
        },
      ],
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <ScrollArea className="min-h-0 flex-1 px-4 py-4">
        {greeting && messages.length === 0 && (
          <Bubble role="ai" text={greeting} />
        )}
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.text} />
        ))}
        {thread.isLoading && messages.at(-1)?.role === "human" && (
          <Bubble role="ai" text="" loading />
        )}
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
            disabled={thread.isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || thread.isLoading}
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