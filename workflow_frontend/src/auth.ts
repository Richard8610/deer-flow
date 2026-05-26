const TOKEN_KEY = 'hub_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Fetch wrapper that adds auth header and redirects to /login on 401. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...authHeaders(), ...(init.headers as Record<string, string> ?? {}) };
  const resp = await fetch(input, { ...init, headers });
  if (resp.status === 401) {
    clearToken();
    window.location.href = '/login';
    return resp;
  }
  return resp;
}