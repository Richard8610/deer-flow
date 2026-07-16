import { Toaster } from "sonner";

import { QueryClientProvider } from "@/components/query-client-provider";

import { DashboardSidebar } from "./_components/dashboard-sidebar";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <QueryClientProvider>
      <div className="flex min-h-screen bg-background">
        <DashboardSidebar />
        <main className="min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}