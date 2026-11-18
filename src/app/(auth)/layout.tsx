import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex justify-center" aria-label="FamilyGuard AI home">
          <Logo />
        </Link>
        <div className="glass gradient-border rounded-3xl p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
