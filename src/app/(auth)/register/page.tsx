import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { FirebaseRequired } from "@/components/auth/FirebaseRequired";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getSessionUser } from "@/lib/auth/session";
import { isFirebaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  if (isFirebaseConfigured() && (await getSessionUser())) redirect("/dashboard");
  return (
    <>
      <AuthHeading title="Create your account" subtitle="Start a family group and invite the people you trust." />
      <FirebaseRequired>
        <RegisterForm />
      </FirebaseRequired>
    </>
  );
}
