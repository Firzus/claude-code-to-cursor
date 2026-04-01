import * as React from "react";
import { cn } from "~/lib/utils";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  side?: "top" | "bottom";
}

function Tooltip({ content, children, className, side = "top" }: TooltipProps) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 scale-95 rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-xs text-foreground shadow-xl opacity-0 transition-all duration-150 group-hover/tip:scale-100 group-hover/tip:opacity-100",
          side === "top" && "bottom-full mb-1.5",
          side === "bottom" && "top-full mt-1.5",
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}

export { Tooltip };
