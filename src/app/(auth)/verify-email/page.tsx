import type { Metadata } from "next";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { FirebaseRequired } from "@/components/auth/FirebaseRequired";
import { VerifyEmailPanel } from "@/components/auth/VerifyEmailPanel";

export const metadata: Metadata = { title: "Verify your email" };

export default function VerifyEmailPage() {
  return (
    <>
      <AuthHeading title="Verify your email" subtitle="One more step to keep your family's account secure." />
      <FirebaseRequired>
        <VerifyEmailPanel />
      </FirebaseRequired>
    </>
  );
}
