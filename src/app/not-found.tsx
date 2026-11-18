import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <EmptyState
        icon={<Compass className="h-6 w-6" />}
        title="Page not found"
        description="The page you're looking for doesn't exist or you don't have access to it."
        action={
          <Link href="/dashboard" className="text-sm font-medium text-neon-cyan hover:underline">
            Back to dashboard
          </Link>
        }
      />
    </div>
  );
}
