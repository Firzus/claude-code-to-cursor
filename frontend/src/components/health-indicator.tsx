import { useHealth } from "~/hooks/use-health";
import { cn } from "~/lib/utils";
import { Badge } from "./ui/badge";

export function HealthIndicator() {
  const { data, isLoading, isError } = useHealth();

  if (isLoading) return <Dot color="muted" label="Loading" />;

  if (isError || !data)
    return (
      <Badge variant="destructive" className="gap-1.5 text-[11px] font-normal">
        <span className="h-1.5 w-1.5 rounded-full bg-destructive-foreground animate-pulse" />
        Offline
      </Badge>
    );

  if (!data.claudeCode.authenticated)
    return (
      <Badge variant="destructive" className="gap-1.5 text-[11px] font-normal">
        <span className="h-1.5 w-1.5 rounded-full bg-destructive-foreground animate-pulse" />
        Unauthenticated
      </Badge>
    );

  if (data.rateLimit.isLimited)
    return (
      <Badge variant="warning" className="gap-1.5 text-[11px] font-normal">
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
        Rate limited
      </Badge>
    );

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
    <div className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status">
      {label && <span>{label}</span>}
      <span className={cn("h-2 w-2 rounded-full", c)} aria-hidden="true" />
    </div>
  );
}
