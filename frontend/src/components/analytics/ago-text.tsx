import { useState, useEffect } from "react";

export function AgoText({ updatedAt }: { updatedAt: number }) {
  const [text, setText] = useState("just now");

  useEffect(() => {
    const timer = setInterval(() => {
      const secs = Math.round((Date.now() - updatedAt) / 1000);
      if (secs < 5) setText("just now");
      else if (secs < 60) setText(`${secs}s ago`);
      else setText(`${Math.floor(secs / 60)}m ago`);
    }, 1000);
    return () => clearInterval(timer);
  }, [updatedAt]);

  return (
    <span className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5" role="status" aria-live="polite">
      <span className="h-1 w-1 rounded-full bg-success animate-pulse inline-block" aria-hidden="true" />
      <span className="sr-only">Last updated </span>
      {text}
    </span>
  );
}
