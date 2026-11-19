"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mail, Smartphone } from "lucide-react";
import { Button, Input, Notice } from "@/components/ui";
import { authErrorMessage } from "@/lib/auth/errors";
import { withNext } from "@/lib/auth/safe-redirect";
import { signInWithEmail } from "@/lib/auth/client";
import { fieldErrors, loginSchema } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";
import { Divider } from "./AuthHeading";
import { GoogleButton } from "./GoogleButton";
import { PhoneSignIn } from "./PhoneSignIn";

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const router = useRouter();
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const done = () => {
    router.replace(next); // protected routes are dynamic → rendered with the new session
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const parsed = loginSchema.safeParse(data);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setLoading(true);
    try {
      const outcome = await signInWithEmail(parsed.data.email, parsed.data.password);
      if (outcome.status === "verify_email") router.push(withNext("/verify-email", next));
      else done();
    } catch (err) {
      setFormError(authErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {notice && <Notice tone="safe">{notice}</Notice>}
      {formError && <Notice tone="danger">{formError}</Notice>}

      <GoogleButton onSignedIn={done} onError={setFormError} />
      <Divider />

      <div role="tablist" aria-label="Sign-in method" className="grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1">
        {(
          [
            ["email", "Email", Mail],
            ["phone", "Phone", Smartphone],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={method === key}
            onClick={() => {
              setMethod(key);
              setFormError(null);
            }}
            className={cn(
              "flex h-9 items-center justify-center gap-2 rounded-lg text-sm transition-colors",
              method === key ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {method === "email" ? (
        <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Sign in with email">
          <Input name="email" type="email" label="Email" autoComplete="email" error={errors.email} required />
          <div className="space-y-1.5">
            <Input
              name="password"
              type="password"
              label="Password"
              autoComplete="current-password"
              error={errors.password}
              required
            />
            <div className="text-right">
              <Link href="/forgot-password" className="text-xs text-neon-cyan hover:underline">
                Forgot password?
              </Link>
            </div>
          </div>
          <Button type="submit" className="w-full" loading={loading}>
            Sign in
          </Button>
        </form>
      ) : (
        <PhoneSignIn onSignedIn={done} onError={setFormError} />
      )}

      <p className="text-center text-sm text-slate-400">
        New to FamilyGuard?{" "}
        <Link href={withNext("/register", next)} className="font-medium text-neon-cyan hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
