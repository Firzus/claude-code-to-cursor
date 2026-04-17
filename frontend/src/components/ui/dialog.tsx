import { X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "~/lib/utils";
import { Button } from "./button";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Footer actions (rendered on the right). */
  footer?: ReactNode;
  /** Show the close `X` button in the top-right corner. */
  showClose?: boolean;
  className?: string;
  size?: "sm" | "default" | "lg";
  /** Terminal-style eyebrow `// prompt.confirm` above the title. */
  eyebrow?: ReactNode;
}

const sizeMap = {
  sm: "max-w-sm",
  default: "max-w-md",
  lg: "max-w-lg",
} as const;

/**
 * Accessible modal dialog. Portals into `document.body`, traps focus, restores
 * focus on close, closes on Escape / backdrop click. Use this instead of
 * rolling your own — e.g. see `ConfirmDialog` for a destructive specialisation.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  showClose = true,
  className,
  size = "default",
  eyebrow,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [close],
  );

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement;
    document.addEventListener("keydown", handleKeyDown);
    // Lock scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = requestAnimationFrame(() => {
      const autofocus = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]");
      if (autofocus) autofocus.focus();
      else panelRef.current?.focus();
    });
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(focusTimer);
      previousFocusRef.current?.focus();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close dialog"
        onClick={close}
        className="absolute inset-0 bg-background/85 backdrop-blur-sm animate-fade-in cursor-default"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        data-surface="terminal"
        className={cn(
          "relative z-10 w-full animate-slide-up font-mono shadow-xl",
          sizeMap[size],
          className,
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div className="min-w-0 space-y-1">
            {eyebrow && (
              <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
                <span aria-hidden="true" className="text-muted-foreground/60">
                  {"//"}
                </span>
                {eyebrow}
              </div>
            )}
            <h2
              id={titleId}
              className="text-[14px] font-semibold tracking-tight text-foreground truncate"
            >
              {title}
            </h2>
          </div>
          {showClose && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close dialog"
              onClick={close}
              className="-mr-1.5 -mt-1"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
        </header>

        <div className="px-4 py-3.5 text-[12.5px] leading-relaxed text-muted-foreground">
          {description && (
            <p id={descId} className="mb-3 last:mb-0">
              {description}
            </p>
          )}
          {children}
        </div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-border/60 px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Colour tone for the confirm action. `destructive` is the default. */
  tone?: "destructive" | "default" | "accent";
  /** Terminal-style eyebrow. */
  eyebrow?: ReactNode;
}

/**
 * Pre-wired confirmation Dialog. Cancel gets autofocus to reduce accidental
 * destructive confirms.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "destructive",
  eyebrow = "prompt.confirm",
}: ConfirmDialogProps) {
  const variantFor = (t: typeof tone): "destructive" | "default" | "accent" => t;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      eyebrow={eyebrow}
      showClose={false}
      footer={
        <>
          <Button variant="outline" size="sm" data-autofocus onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button variant={variantFor(tone)} size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
