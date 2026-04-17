import { ConfirmDialog as UiConfirmDialog } from "~/components/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
}

/**
 * Thin wrapper over the shared `ConfirmDialog` primitive. Kept here to
 * preserve the legacy import path used throughout analytics.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  confirmLabel = "Reset",
}: ConfirmDialogProps) {
  return (
    <UiConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={title}
      description={description}
      onConfirm={onConfirm}
      confirmLabel={confirmLabel}
      tone="destructive"
    />
  );
}
