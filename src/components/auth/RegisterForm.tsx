"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Notice } from "@/components/ui";
import { authErrorMessage } from "@/lib/auth/errors";
import { registerWithEmail } from "@/lib/auth/client";
import { withNext } from "@/lib/auth/safe-redirect";
import { fieldErrors, registerSchema } from "@/lib/validation/auth";
import { Divider } from "./AuthHeading";
import { GoogleButton } from "./GoogleButton";
import { PasswordStrength } from "./PasswordStrength";

export function RegisterForm({ next = "/dashboard" }: { next?: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const parsed = registerSchema.safeParse({ ...Object.fromEntries(fd), acceptTerms: fd.get("acceptTerms") === "on" });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setLoading(true);
    try {
      await registerWithEmail(parsed.data);
      router.push(withNext("/verify-email", next));
    } catch (err) {
      setFormError(authErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {formError && <Notice tone="danger">{formError}</Notice>}
      <GoogleButton
        onSignedIn={() => {
          router.replace(next);
        }}
        onError={setFormError}
      />
      <Divider label="or with email" />
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Create account">
        <Input name="displayName" label="Your name" autoComplete="name" error={errors.displayName} />
        <Input name="email" type="email" label="Email" autoComplete="email" error={errors.email} />
        <div className="space-y-2">
          <Input
            name="password"
            type="password"
            label="Password"
            autoComplete="new-password"
            error={errors.password}
            hint="At least 8 characters, with letters and numbers."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordStrength password={password} />
        </div>
        <Input
          name="confirmPassword"
          type="password"
          label="Confirm password"
          autoComplete="new-password"
          error={errors.confirmPassword}
        />
        <div>
          <label className="flex items-start gap-2.5 text-sm text-slate-300">
            <input
              type="checkbox"
              name="acceptTerms"
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-ink-900 accent-[#4f7cff]"
              aria-invalid={errors.acceptTerms ? true : undefined}
            />
            <span>
              I agree to the Terms and Privacy Policy. I understand my location is only shared when I turn sharing on.
            </span>
          </label>
          {errors.acceptTerms && (
            <p role="alert" className="mt-1 text-xs text-[#ff8399]">
              {errors.acceptTerms}
            </p>
          )}
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          Create account
        </Button>
      </form>
      <p className="text-center text-sm text-slate-400">
        Already have an account?{" "}
        <Link href={withNext("/login", next)} className="font-medium text-neon-cyan hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
