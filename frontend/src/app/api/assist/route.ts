import type { NextRequest } from "next/server";

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "http://127.0.0.1:8001";

export async function POST(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  const upstream = await fetch(`${BACKEND_BASE_URL}/api/assist`, {
    method: "POST",
    headers,
    body: await request.arrayBuffer(),
  });

  // Stream the SSE response body directly through without buffering
  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}