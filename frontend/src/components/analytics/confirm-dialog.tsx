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
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="relative z-10 w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-xl animate-slide-up">
        <h2
          id="confirm-title"
          className="text-[14px] font-semibold mb-1"
        >
          {title}
        </h2>
        <p className="text-[13px] text-muted-foreground mb-5">
          {description}
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
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
