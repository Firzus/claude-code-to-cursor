import { cn } from "~/lib/utils";

interface StatusRowProps {
  ok: boolean;
  loading?: boolean;
  label: string;
  sub: string;
}

export function StatusRow({ ok, loading, label, sub }: StatusRowProps) {
  const dotClass = ok
    ? "bg-success"
    : loading
      ? "bg-warning animate-pulse"
      : "bg-muted-foreground/40";
  const stateLabel = ok ? "ok" : loading ? "wait" : "—";
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 font-mono">
      <span
        aria-hidden="true"
        className={cn("mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full", dotClass)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12px] text-foreground">{label}</span>
          <span
            className={cn(
              "text-[10px] uppercase tracking-[0.2em]",
              ok ? "text-success" : loading ? "text-warning" : "text-muted-foreground/60",
            )}
          >
            {stateLabel}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
      </div>
    </div>
  );
}
