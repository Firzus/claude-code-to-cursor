import { useHealth } from "~/hooks/use-health";
import { cn } from "~/lib/utils";

export function HealthIndicator() {
  const { data, isLoading, isError } = useHealth();

  if (isLoading) return <Dot color="muted" />;
  if (isError || !data) return <Dot color="red" label="Offline" />;
  if (!data.claudeCode.authenticated) return <Dot color="red" label="Unauthenticated" />;
  if (data.rateLimit.isLimited) return <Dot color="amber" label="Rate limited" />;
  return <Dot color="green" label="Online" />;
}

function Dot({ color, label }: { color: "green" | "red" | "amber" | "muted"; label?: string }) {
  const c = {
    green: "bg-success",
    red: "bg-destructive",
    amber: "bg-warning",
    muted: "bg-muted-foreground",
  }[color];

  return (
    <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
      {label && <span>{label}</span>}
      <span className={cn("h-2 w-2 rounded-full", c)} />
    </div>
  );
}
