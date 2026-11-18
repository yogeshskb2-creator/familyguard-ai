"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Input, Notice } from "@/components/ui";
import { authErrorMessage } from "@/lib/auth/errors";
import { requestPasswordReset } from "@/lib/auth/client";
import { emailSchema } from "@/lib/validation/auth";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const parsed = emailSchema.safeParse(new FormData(e.currentTarget).get("email"));
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setError(undefined);
    setLoading(true);
    try {
      await requestPasswordReset(parsed.data);
      setSent(true);
    } catch (err) {
      setFormError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-5">
        <Notice tone="safe" title="Check your inbox">
          If an account exists for that email, we&apos;ve sent a link to reset your password. The link expires in 1 hour.
        </Notice>
        <Link href="/login" className="block text-center text-sm font-medium text-neon-cyan hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Reset password">
      {formError && <Notice tone="danger">{formError}</Notice>}
      <Input name="email" type="email" label="Email" autoComplete="email" error={error} />
      <Button type="submit" className="w-full" loading={loading}>
        Send reset link
      </Button>
      <Link href="/login" className="block text-center text-sm text-slate-400 hover:text-white">
        Back to sign in
      </Link>
    </form>
  );
}
