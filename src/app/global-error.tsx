"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#04050d", color: "#e6e9ff", fontFamily: "system-ui", display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <h1>Something went wrong</h1>
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
