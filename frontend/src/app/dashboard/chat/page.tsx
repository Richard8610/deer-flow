"use client";

import { DashboardChat } from "../_components/dashboard-chat";

export default function ChatPage() {
  return (
    <div className="flex h-screen flex-col">
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-bold">Chat</h1>
        <p className="text-muted-foreground text-sm">
          Talk to the DeerFlow agent directly.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <DashboardChat
          greeting="Hi! I'm the DeerFlow agent. How can I help you today?"
          inputPlaceholder="Ask me anything…"
        />
      </div>
    </div>
  );
}