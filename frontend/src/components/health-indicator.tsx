import { useHealth } from "~/hooks/use-health";
import { cn } from "~/lib/utils";

type Tone = "success" | "warning" | "destructive" | "muted";

interface HealthState {
  label: string;
  tone: Tone;
  pulse?: boolean;
}

function resolveState({ isLoading, isError, data }: ReturnType<typeof useHealth>): HealthState {
  if (isLoading) return { label: "loading", tone: "muted", pulse: true };
  if (isError || !data) return { label: "offline", tone: "destructive", pulse: true };
  if (!data.claudeCode.authenticated) return { label: "unauth", tone: "destructive", pulse: true };
  if (data.rateLimit.isLimited) return { label: "limited", tone: "warning", pulse: true };
  return { label: "online", tone: "success" };
}

const toneDot: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  muted: "bg-muted-foreground/40",
};

export function HealthIndicator() {
  const query = useHealth();
  const state = resolveState(query);

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={`Proxy status: ${state.label}`}
      className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          toneDot[state.tone],
          state.pulse && "animate-pulse",
        )}
      />
      <span className="hidden sm:inline">{state.label}</span>
    </span>
  );
}
