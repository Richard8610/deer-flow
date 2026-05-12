"use client";

import { isBackendUnavailable } from "@/core/utils/fetch";

export function BackendOfflineBanner({ error }: { error: unknown }) {
  if (!isBackendUnavailable(error)) return null;
  return (
    <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 dark:border-yellow-900 dark:bg-yellow-950/30">
      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
        Backend is not running
      </p>
      <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
        Start the DeerFlow server from the project root:
      </p>
      <code className="mt-1 block rounded bg-yellow-100 px-2 py-1 font-mono text-xs text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-100">
        make dev
      </code>
    </div>
  );
}

export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  if (isBackendUnavailable(error)) return <BackendOfflineBanner error={error} />;
  return (
    <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {error instanceof Error ? error.message : "An unexpected error occurred"}
    </div>
  );
}