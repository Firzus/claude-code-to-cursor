import type { HTMLAttributes } from "react";
import { cn } from "~/lib/utils";

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "line" | "circle";
}

function Skeleton({ className, variant = "default", ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse bg-muted/80",
        variant === "default" && "rounded-md",
        variant === "line" && "h-3 rounded-sm",
        variant === "circle" && "rounded-full",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
