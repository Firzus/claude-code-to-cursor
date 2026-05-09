"use client";

import { RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { AuroraShader } from "~/components/layout/aurora-shader";
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

  // Stack traces and exception messages can leak internals (file paths, SQL,
  // env-driven URLs). Surface them in dev so the developer sees the cause,
  // hide them in prod so visitors only see the generic copy.
  const showRawMessage = process.env.NODE_ENV !== "production";

  return (
    <div className="relative flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <AuroraShader className="-top-24 h-[36rem]" intensity={0.5} />
      <span className="eyebrow">Something interrupted the proxy view</span>
      <h1 className="font-display text-4xl tracking-tight md:text-5xl text-balance max-w-xl">
        We couldn&apos;t finish loading this page.
      </h1>
      <p className="max-w-md text-pretty text-muted-foreground">
        {showRawMessage && error.message
          ? `${error.message} Retry below — if it keeps happening, check that the API service is running.`
          : "An unexpected error occurred. Retry below — if it keeps happening, check that the API service is running."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => reset()}>
          <RefreshCcw className="size-4" aria-hidden="true" />
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back to overview</Link>
        </Button>
      </div>
      {error.digest ? (
        <p className="font-mono text-[11px] text-muted-foreground/80">
          digest: <span className="text-foreground">{error.digest}</span>
        </p>
      ) : null}
    </div>
  );
}
