import { useCallback, useEffect, useId, useRef } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
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
    [onCancel],
  );

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      document.addEventListener("keydown", handleKeyDown);
      requestAnimationFrame(() => {
        const cancel = dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]");
        cancel?.focus();
      });
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (!open) previousFocusRef.current?.focus();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-xl animate-slide-up"
      >
        <h2 id={titleId} className="text-sm font-semibold mb-1">
          {title}
        </h2>
        <p id={descId} className="text-[13px] text-muted-foreground mb-5">
          {description}
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            data-autofocus
            onClick={onCancel}
            className="h-8 rounded-md border border-border px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="h-8 rounded-md bg-destructive px-3 text-[13px] font-medium text-destructive-foreground transition-opacity hover:opacity-90 cursor-pointer"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
