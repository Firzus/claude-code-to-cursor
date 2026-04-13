import type { LucideIcon } from "lucide-react";
import { cn } from "~/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in",
        className,
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground mb-4">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-[13px] font-medium mb-1">{title}</h3>
      <p className="text-[12px] text-muted-foreground max-w-xs leading-relaxed">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
