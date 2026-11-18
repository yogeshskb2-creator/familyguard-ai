"use client";

import { useState } from "react";
import type { ConfirmationResult } from "firebase/auth";
import { Button, Input } from "@/components/ui";
import { authErrorMessage } from "@/lib/auth/errors";
import { confirmPhoneCode, startPhoneSignIn } from "@/lib/auth/client";
import { otpSchema, phoneSchema } from "@/lib/validation/auth";

const RECAPTCHA_ID = "recaptcha-container";

export function PhoneSignIn({ onSignedIn, onError }: { onSignedIn: () => void; onError: (msg: string | null) => void }) {
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setError(undefined);
    setLoading(true);
    try {
      setConfirmation(await startPhoneSignIn(parsed.data, RECAPTCHA_ID));
    } catch (err) {
      onError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onError(null);
    const parsed = otpSchema.safeParse(new FormData(e.currentTarget).get("code"));
    if (!parsed.success || !confirmation) return setError(parsed.error?.issues[0]?.message);
    setError(undefined);
    setLoading(true);
    try {
      await confirmPhoneCode(confirmation, parsed.data);
      onSignedIn();
    } catch (err) {
      onError(authErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <>
      {!confirmation ? (
        <form key="phone-step" onSubmit={sendCode} noValidate className="space-y-4" aria-label="Sign in with phone">
          <Input
            name="phone"
            type="tel"
            label="Mobile number"
            placeholder="+91 98765 43210"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={error}
            hint="We'll text you a 6-digit code. Standard SMS rates may apply."
          />
          <Button type="submit" className="w-full" loading={loading}>
            Send code
          </Button>
        </form>
      ) : (
        <form key="code-step" onSubmit={verify} noValidate className="space-y-4" aria-label="Enter verification code">
          <Input
            name="code"
            label={`Code sent to ${phone}`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            error={error}
            autoFocus
          />
          <Button type="submit" className="w-full" loading={loading}>
            Verify &amp; sign in
          </Button>
          <button
            type="button"
            className="w-full text-center text-xs text-slate-400 hover:text-white"
            onClick={() => setConfirmation(null)}
          >
            Use a different number
          </button>
        </form>
      )}
      <div id={RECAPTCHA_ID} />
    </>
  );
}
