"use client";

import { useEffect } from "react";

// Renders ONLY when the RootLayout itself throws — Next replaces the entire
// document with this component, so we own `<html>` and `<body>` here. For
// errors inside route segments (the common case), `app/error.tsx` is used
// instead; that one inherits the layout chain and is far less spartan.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
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
          gap: "1.5rem",
          padding: "2rem",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "white",
          color: "#1a1a1a",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>
          The dashboard couldn&apos;t start.
        </h1>
        <p style={{ maxWidth: "32rem", color: "#555", margin: 0 }}>
          A fatal error happened before the page layout could render. Try
          again — if it persists, check that the API service is running and
          look for stack traces in the server logs.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.375rem",
            border: "1px solid #d4d4d8",
            background: "#fafafa",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          Try again
        </button>
        {error.digest ? (
          <p style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "#888" }}>
            digest: {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
