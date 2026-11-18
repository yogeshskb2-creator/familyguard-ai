"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { authErrorMessage } from "@/lib/auth/errors";
import { signInWithGoogle } from "@/lib/auth/client";

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.8 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12Z" />
    </svg>
  );
}

export function GoogleButton({ onSignedIn, onError }: { onSignedIn: () => void; onError: (msg: string) => void }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="secondary"
      className="w-full"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await signInWithGoogle();
          onSignedIn();
        } catch (err) {
          onError(authErrorMessage(err));
          setLoading(false);
        }
      }}
    >
      {!loading && <GoogleGlyph />} Continue with Google
    </Button>
  );
}
