"use client";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; fields?: Record<string, string> };

/** JSON fetch against our own API with uniform error handling. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: init.method ?? "GET",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data: json as T };
    return {
      ok: false,
      status: res.status,
      code: json?.error?.code ?? "error",
      message: json?.error?.message ?? "Something went wrong.",
      fields: json?.error?.fields,
    };
  } catch {
    return { ok: false, status: 0, code: "network", message: "Network error. Check your connection and try again." };
  }
}
