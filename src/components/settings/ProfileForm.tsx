"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Notice } from "@/components/ui";
import { fieldErrors, profileUpdateSchema } from "@/lib/validation/auth";
import type { AiProvider } from "@/types/models";

const PROVIDERS: { value: AiProvider; label: string }[] = [
  { value: "claude", label: "Claude (Anthropic)" },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Google Gemini" },
];

export function ProfileForm({ displayName, aiProvider }: { displayName: string; aiProvider: AiProvider }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ tone: "safe" | "danger"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    const parsed = profileUpdateSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await res.json();
      if (!res.ok) {
        setErrors(body.error?.fields ?? {});
        setStatus({ tone: "danger", text: body.error?.message ?? "Could not save your profile." });
      } else {
        setStatus({ tone: "safe", text: "Profile saved." });
        router.refresh();
      }
    } catch {
      setStatus({ tone: "danger", text: "Network error. Try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Edit profile">
      {status && <Notice tone={status.tone}>{status.text}</Notice>}
      <Input name="displayName" label="Display name" defaultValue={displayName} error={errors.displayName} autoComplete="name" />
      <div className="space-y-1.5">
        <label htmlFor="aiProvider" className="block text-xs font-medium text-slate-300">
          Preferred AI assistant
        </label>
        <select
          id="aiProvider"
          name="aiProvider"
          defaultValue={aiProvider}
          className="h-11 w-full rounded-xl border border-white/10 bg-ink-900/70 px-3 text-sm text-white focus:border-neon-blue/60 focus:outline-none focus:ring-2 focus:ring-neon-blue/30"
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" loading={saving}>
        Save changes
      </Button>
    </form>
  );
}
