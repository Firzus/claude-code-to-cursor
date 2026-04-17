import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, type LucideIcon, XCircle } from "lucide-react";
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "~/lib/utils";

const alertVariants = cva(
  [
    "relative flex gap-3 rounded-md border px-3 py-2.5 text-[12.5px] leading-relaxed",
    "font-mono animate-slide-up",
  ].join(" "),
  {
    variants: {
      variant: {
        info: "border-accent/30 bg-accent/5 text-foreground [--alert-accent:var(--color-accent)]",
        success:
          "border-success/30 bg-success/5 text-success [--alert-accent:var(--color-success)]",
        warning:
          "border-warning/30 bg-warning/5 text-warning [--alert-accent:var(--color-warning)]",
        error:
          "border-destructive/40 bg-destructive/5 text-destructive [--alert-accent:var(--color-destructive)]",
        neutral:
          "border-border/70 bg-card/40 text-muted-foreground [--alert-accent:var(--color-muted-foreground)]",
      },
      size: {
        sm: "px-2.5 py-2 text-[12px]",
        default: "px-3 py-2.5 text-[12.5px]",
      },
    },
    defaultVariants: { variant: "info", size: "default" },
  },
);

const defaultIcons: Record<
  NonNullable<VariantProps<typeof alertVariants>["variant"]>,
  LucideIcon
> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  neutral: Info,
};

export interface AlertProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof alertVariants> {
  icon?: LucideIcon | null;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  (
    {
      className,
      variant = "info",
      size,
      icon,
      title,
      description,
      action,
      children,
      role = "status",
      ...props
    },
    ref,
  ) => {
    const Icon = icon === null ? null : (icon ?? defaultIcons[variant ?? "info"]);
    const ariaLive = variant === "error" ? "assertive" : "polite";
    return (
      <div
        ref={ref}
        role={variant === "error" ? "alert" : role}
        aria-live={ariaLive}
        className={cn(alertVariants({ variant, size }), className)}
        {...props}
      >
        {Icon && (
          <Icon
            aria-hidden="true"
            className="h-4 w-4 shrink-0 mt-px"
            style={{ color: "var(--alert-accent)" }}
          />
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          {title && <div className="font-medium tracking-tight">{title}</div>}
          {description && <div className="text-muted-foreground/90">{description}</div>}
          {children}
        </div>
        {action && <div className="shrink-0 flex items-center">{action}</div>}
      </div>
    );
  },
);
Alert.displayName = "Alert";

export { alertVariants };
