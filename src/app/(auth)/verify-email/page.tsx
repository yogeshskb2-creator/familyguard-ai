import type { Metadata } from "next";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { FirebaseRequired } from "@/components/auth/FirebaseRequired";
import { VerifyEmailPanel } from "@/components/auth/VerifyEmailPanel";
import { safeRedirect } from "@/lib/auth/safe-redirect";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRedirect((await searchParams).next);
  return (
    <>
      <AuthHeading title="Verify your email" subtitle="One more step to keep your family's account secure." />
      <FirebaseRequired>
        <VerifyEmailPanel next={next} />
      </FirebaseRequired>
    </>
  );
}
