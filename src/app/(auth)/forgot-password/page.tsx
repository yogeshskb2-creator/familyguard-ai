import type { Metadata } from "next";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { FirebaseRequired } from "@/components/auth/FirebaseRequired";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading title="Reset your password" subtitle="Enter your email and we'll send you a reset link." />
      <FirebaseRequired>
        <ForgotPasswordForm />
      </FirebaseRequired>
    </>
  );
}
