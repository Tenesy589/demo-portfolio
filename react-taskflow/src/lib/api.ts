import { useAuth } from '@/store/auth';

export class ApiError extends Error {
  constructor(public status: number, public body: any) {
    super(typeof body?.message === 'string' ? body.message : `HTTP ${status}`);
  }
}

/** Thin typed fetch wrapper: attaches the JWT, parses JSON, logs out on 401. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const token = useAuth.getState().token;
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401) useAuth.getState().logout();
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}
