"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: "⬡" },
  { href: "/dashboard/chat", label: "Chat", icon: "💬" },
  { href: "/dashboard/mcp", label: "MCP Servers", icon: "⚙" },
  { href: "/dashboard/knowledge-base", label: "Knowledge Base", icon: "🗂" },
  { href: "/dashboard/agents", label: "Agents", icon: "🤖" },
  { href: "/dashboard/skills", label: "Skills Creator", icon: "🔧" },
] as const;

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/30 px-3 py-6">
      <Link href="/" className="mb-8 px-3 text-lg font-bold tracking-tight">
        DeerFlow
      </Link>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const isActive =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto">
        <Link
          href="/workspace/chats"
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <span className="text-base leading-none">💬</span>
          Go to Chat
        </Link>
      </div>
    </aside>
  );
}