"use client";

import { useEffect } from "react";
import { Button } from "~/components/ui/button";

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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <span className="eyebrow">Something interrupted the proxy view</span>
      <h1 className="font-display text-4xl tracking-tight md:text-5xl">
        We couldn’t finish loading this page.
      </h1>
      <p className="max-w-md text-pretty text-muted-foreground">
        {error.message || "An unexpected error occurred."} Retry below — if it keeps happening,
        check that the API service is running.
      </p>
      <Button onClick={() => reset()}>Try again</Button>
    </div>
  );
}
