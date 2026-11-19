"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { Button, Notice, Skeleton } from "@/components/ui";
import { useAuthUser } from "@/hooks/useAuthUser";
import { AuthFlowError, authErrorMessage } from "@/lib/auth/errors";
import { completeEmailVerification, resendVerificationEmail, signOut } from "@/lib/auth/client";
import { withNext } from "@/lib/auth/safe-redirect";

const RESEND_COOLDOWN_SEC = 60;

export function VerifyEmailPanel({ next = "/dashboard" }: { next?: string }) {
  const router = useRouter();
  const { user, loading } = useAuthUser();
  const [message, setMessage] = useState<{ tone: "safe" | "danger" | "info"; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (loading) return <Skeleton className="h-40" />;

  if (!user) {
    return (
      <Notice tone="info" title="Sign in to continue">
        Your session has ended. <Link className="underline" href={withNext("/login", next)}>Sign in</Link> again — if your email still
        isn&apos;t verified we&apos;ll send a new link.
      </Notice>
    );
  }

  async function check() {
    setChecking(true);
    setMessage(null);
    try {
      const result = await completeEmailVerification();
      if (result === "verified") {
        router.replace(next);
        return;
      }
      setMessage({ tone: "info", text: "Not verified yet. Click the link in the email, then try again." });
    } catch (err) {
      if (err instanceof AuthFlowError && err.code === "stale_sign_in") {
        await signOut();
        router.replace(withNext("/login", next, "verified=1"));
        return;
      }
      setMessage({ tone: "danger", text: authErrorMessage(err) });
    } finally {
      setChecking(false);
    }
  }

  async function resend() {
    setMessage(null);
    try {
      await resendVerificationEmail();
      setCooldown(RESEND_COOLDOWN_SEC);
      setMessage({ tone: "safe", text: "Verification email sent." });
    } catch (err) {
      setMessage({ tone: "danger", text: authErrorMessage(err) });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-4">
        <MailCheck className="h-6 w-6 shrink-0 text-neon-cyan" aria-hidden="true" />
        <p className="text-sm text-slate-300">
          We sent a verification link to <span className="font-medium text-white">{user.email}</span>.
        </p>
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <Button className="w-full" onClick={check} loading={checking}>
        I&apos;ve verified my email
      </Button>
      <Button variant="ghost" className="w-full" onClick={resend} disabled={cooldown > 0}>
        {cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend email"}
      </Button>
      <button
        type="button"
        className="w-full text-center text-xs text-slate-500 hover:text-slate-300"
        onClick={async () => {
          await signOut();
          router.replace(withNext("/login", next));
        }}
      >
        Use a different account
      </button>
    </div>
  );
}
