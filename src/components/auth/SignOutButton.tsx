"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui";
import { signOut } from "@/lib/auth/client";

export function SignOutButton({
  everywhere = false,
  children,
  ...props
}: { everywhere?: boolean } & Omit<ButtonProps, "onClick">) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      {...props}
      loading={loading}
      onClick={async () => {
        if (everywhere && !window.confirm("Sign out of FamilyGuard on all your devices?")) return;
        setLoading(true);
        await signOut({ everywhere });
        router.replace("/login");
      }}
    >
      {!loading && <LogOut className="h-4 w-4" aria-hidden="true" />}
      {children ?? (everywhere ? "Sign out everywhere" : "Sign out")}
    </Button>
  );
}
