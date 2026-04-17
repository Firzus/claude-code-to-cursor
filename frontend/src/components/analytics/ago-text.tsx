import { useEffect, useState } from "react";

export function AgoText({ updatedAt }: { updatedAt: number }) {
  const [text, setText] = useState("just now");

  useEffect(() => {
    function tick() {
      const secs = Math.round((Date.now() - updatedAt) / 1000);
      if (secs < 5) setText("just now");
      else if (secs < 60) setText(`${secs}s ago`);
      else setText(`${Math.floor(secs / 60)}m ago`);
    }
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [updatedAt]);

  return (
    <span
      className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className="inline-block h-1 w-1 rounded-full bg-success animate-pulse"
      />
      <span className="sr-only">Last updated </span>
      {text}
    </span>
  );
}
