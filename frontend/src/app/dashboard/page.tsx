import Link from "next/link";

import { Card } from "@/components/ui/card";

const MODULES = [
  {
    href: "/dashboard/mcp",
    title: "MCP Servers",
    description: "Connect and manage Model Context Protocol servers that extend the agent's capabilities with external tools and data sources.",
    icon: "⚙",
  },
  {
    href: "/dashboard/knowledge-base",
    title: "Knowledge Base",
    description: "View and manage the persistent memory and facts that are injected into agent conversations.",
    icon: "🗂",
  },
  {
    href: "/dashboard/agents",
    title: "Agents",
    description: "Create and configure custom agents with unique personalities, models, and tool access.",
    icon: "🤖",
  },
  {
    href: "/dashboard/skills",
    title: "Skills Creator",
    description: "Browse, enable, and install skills that give agents access to specialized workflows.",
    icon: "🔧",
  },
] as const;

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-2 text-3xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground mb-8">
        Manage your DeerFlow configuration from one place.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {MODULES.map(({ href, title, description, icon }) => (
          <Link key={href} href={href}>
            <Card className="h-full p-6 transition-shadow hover:shadow-md">
              <div className="mb-3 text-3xl">{icon}</div>
              <h2 className="mb-1 text-lg font-semibold">{title}</h2>
              <p className="text-muted-foreground text-sm">{description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}