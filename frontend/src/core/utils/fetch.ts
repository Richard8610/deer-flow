const PROXY_ERROR_STATUSES = new Set([500, 502, 503, 504]);
const PROXY_BODY_PATTERNS = [
  "Internal Server Error",
  "Bad Gateway",
  "Service Unavailable",
  "Gateway Timeout",
];

export class BackendUnavailableError extends Error {
  readonly isBackendUnavailable = true;
  constructor() {
    super(
      "Backend is not available. Start the DeerFlow server with: make dev",
    );
    this.name = "BackendUnavailableError";
  }
}

function looksLikeProxyError(status: number, body: string): boolean {
  if (!PROXY_ERROR_STATUSES.has(status)) return false;
  const trimmed = body.trim();
  return (
    PROXY_BODY_PATTERNS.some((p) => trimmed === p) ||
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<html")
  );
}

export async function requireJson<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (looksLikeProxyError(res.status, text)) {
      throw new BackendUnavailableError();
    }
    let detail: string | undefined;
    try {
      detail = (JSON.parse(text) as { detail?: string }).detail;
    } catch {
      // non-JSON error body
    }
    throw new Error(detail ?? `${fallback}: ${res.status} ${res.statusText || text}`);
  }
  return res.json() as Promise<T>;
}

export function isBackendUnavailable(err: unknown): boolean {
  return (
    err instanceof BackendUnavailableError ||
    (err instanceof Error && err.message.includes("Backend is not available"))
  );
}