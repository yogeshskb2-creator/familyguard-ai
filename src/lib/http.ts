import { NextResponse } from "next/server";

export function jsonError(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

export const noStore = { "Cache-Control": "no-store" } as const;
