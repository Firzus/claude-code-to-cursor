import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "~/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border font-mono font-medium tabular whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        default: "border-foreground/70 bg-foreground text-background",
        secondary: "border-border/70 bg-secondary text-secondary-foreground",
        outline: "border-border/70 bg-transparent text-muted-foreground",
        ghost: "border-transparent bg-transparent text-muted-foreground",
        destructive: "border-destructive/40 bg-destructive/15 text-destructive",
        success: "border-success/30 bg-success/15 text-success",
        warning: "border-warning/30 bg-warning/15 text-warning",
        accent: "border-accent/40 bg-accent/15 text-accent",
      },
      size: {
        xs: "h-4 px-1 text-[9px] tracking-[0.18em] uppercase",
        sm: "h-5 px-1.5 text-[10px] tracking-[0.16em] uppercase",
        default: "h-[22px] px-2 text-[11px] tracking-[0.14em] uppercase",
        lg: "h-7 px-2.5 text-[12px] tracking-[0.12em] uppercase",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
