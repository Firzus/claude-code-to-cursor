import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

interface SpinnerProps {
  className?: string;
  label?: string;
  variant?: "braille" | "caret" | "dots";
}

/**
 * Mono loading indicator in keeping with the terminal aesthetic.
 * Respects prefers-reduced-motion via the global rule (animation is via JS
 * so we also guard explicitly here).
 */
export function Spinner({ className, label = "Loading", variant = "braille" }: SpinnerProps) {
  if (variant === "caret") {
    return (
      <span
        role="status"
        aria-label={label}
        className={cn("inline-flex items-center text-current", className)}
      >
        <span aria-hidden="true" className="caret" />
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  if (variant === "dots") {
    return (
      <span
        role="status"
        aria-label={label}
        className={cn("inline-flex items-baseline gap-[2px] text-current", className)}
      >
        <span aria-hidden="true" className="animate-pulse [animation-delay:0ms]">
          ·
        </span>
        <span aria-hidden="true" className="animate-pulse [animation-delay:120ms]">
          ·
        </span>
        <span aria-hidden="true" className="animate-pulse [animation-delay:240ms]">
          ·
        </span>
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return <BrailleSpinner className={className} label={label} />;
}

function BrailleSpinner({ className, label }: { className?: string; label: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % BRAILLE_FRAMES.length);
    }, 80);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-flex items-center justify-center leading-none text-current", className)}
    >
      <span aria-hidden="true" className="inline-block w-[1ch] text-center tabular">
        {BRAILLE_FRAMES[frame]}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
