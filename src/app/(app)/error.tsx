"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
import { AlertOctagon } from "lucide-react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Surface the error for diagnostics (browser console / error-monitoring tools).
  useEffect(() => {
    console.error("[FamilyGuard] page error:", error);
  }, [error]);
  return (
    <EmptyState
      icon={<AlertOctagon className="h-6 w-6" />}
      title="We couldn't load this page"
      description={error.digest ? `Reference: ${error.digest}` : "Please try again in a moment."}
      action={
        <Button variant="secondary" onClick={reset}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
        </Button>
      }
    />
  );
}
