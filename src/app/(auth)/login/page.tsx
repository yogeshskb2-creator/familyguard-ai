import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { FirebaseRequired } from "@/components/auth/FirebaseRequired";
import { LoginForm } from "@/components/auth/LoginForm";
import { safeRedirect } from "@/lib/auth/safe-redirect";
import { getSessionUser } from "@/lib/auth/session";
import { isFirebaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; verified?: string; reset?: string; reauth?: string }>;
}) {
  const sp = await searchParams;
  const next = safeRedirect(sp.next);
  if (isFirebaseConfigured() && (await getSessionUser())) redirect(next);
  const notice = sp.verified
    ? "Email verified. Sign in to continue."
    : sp.reauth
      ? "For your security, sign in again to continue. You'll then have 5 minutes to delete your account."
      : undefined;
  return (
    <>
      <AuthHeading title="Welcome back" subtitle="Sign in to see your family's safety dashboard." />
      <FirebaseRequired>
        <LoginForm next={next} notice={notice} />
      </FirebaseRequired>
    </>
  );
}
