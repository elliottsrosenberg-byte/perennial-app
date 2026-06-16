"use client";

// Root-level error boundary for the App Router. It catches errors thrown in the
// root layout/template that lower error boundaries can't, reports them to
// Sentry, and renders a minimal fallback (it replaces the root layout, so it
// must provide its own <html>/<body>).
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, sans-serif",
          color: "#1a1a1a",
          background: "#faf9f6",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ margin: 0, opacity: 0.7, maxWidth: "28rem" }}>
          The error has been logged and we&apos;ll take a look. You can try again.
        </p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: "0.5rem",
            padding: "0.5rem 1.25rem",
            borderRadius: "0.5rem",
            border: "1px solid #d6d3cc",
            background: "#fff",
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
