import { Check, Circle, Loader2 } from "lucide-react";
import { cn } from "~/lib/utils";

interface StatusRowProps {
  ok: boolean;
  loading?: boolean;
  label: string;
  sub: string;
}

export function StatusRow({ ok, loading, label, sub }: StatusRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-4 transition-all",
        ok ? "border-success/30 bg-success/5" : "border-border bg-card/30",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          ok ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
        )}
      >
        {ok ? (
          <Check className="h-4 w-4" />
        ) : loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{label}</div>
        <div className="text-[12px] text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}
