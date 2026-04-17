import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "~/lib/utils";

/**
 * Single unified Card primitive — all "panel / card / surface" variants in
 * the app route through this component. Variants map to the CSS `[data-surface]`
 * system defined in `app.css`.
 */
const cardVariants = cva("relative w-full text-card-foreground animate-fade-in", {
  variants: {
    variant: {
      flat: "[data-surface]", // handled via data-* below
      panel: "",
      terminal: "",
      ghost: "",
    },
    padding: {
      none: "",
      sm: "p-3",
      default: "p-4",
      lg: "p-5",
      xl: "p-6",
    },
    interactive: {
      true: "cursor-pointer hover:-translate-y-px",
      false: "",
    },
  },
  defaultVariants: {
    variant: "flat",
    padding: "none",
    interactive: false,
  },
});

interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  delay?: number;
  /** Applies the `[data-surface-hover="lift"]` effect */
  lift?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "flat", padding, interactive, delay, lift, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-surface={variant}
        data-surface-hover={lift ? "lift" : undefined}
        className={cn(cardVariants({ variant, padding, interactive }), className)}
        style={{ ...(delay ? { animationDelay: `${delay}ms` } : {}), ...style }}
        {...props}
      />
    );
  },
);
Card.displayName = "Card";

/** Terminal-flavoured header row: eyebrow `INDEX · TITLE` on the left, hint on the right. */
interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  index?: React.ReactNode;
  title?: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
}

const CardHeader = React.forwardRef<HTMLElement, CardHeaderProps>(
  ({ className, index, title, hint, action, children, ...props }, ref) => {
    if (children) {
      return (
        <header
          ref={ref}
          className={cn(
            "flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2",
            "text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground",
            className,
          )}
          {...props}
        >
          {children}
        </header>
      );
    }
    return (
      <header
        ref={ref}
        className={cn(
          "flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2",
          "text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground",
          className,
        )}
        {...props}
      >
        <div className="flex items-baseline gap-2 min-w-0">
          {index !== undefined && <span className="text-muted-foreground/60 tabular">{index}</span>}
          {title !== undefined && (
            <span className="text-foreground/90 truncate font-medium">{title}</span>
          )}
        </div>
        {hint !== undefined && (
          <span className="hidden sm:inline text-[10px] text-muted-foreground/70 tracking-[0.14em] truncate">
            {hint}
          </span>
        )}
        {action}
      </header>
    );
  },
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-[14px] font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-[12.5px] leading-relaxed text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("px-4 py-3", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <footer
      ref={ref}
      className={cn(
        "flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2",
        "text-[10px] uppercase tracking-[0.18em] text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

export type { CardProps };
export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, cardVariants };
