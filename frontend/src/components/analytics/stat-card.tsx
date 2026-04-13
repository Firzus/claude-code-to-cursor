import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  accent: string;
}

export function StatCard({ icon: Icon, label, value, sub, accent }: StatCardProps) {
  return (
    <Card className="group transition-colors hover:border-border/80">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="flex h-6 w-6 items-center justify-center rounded-md"
            style={{
              backgroundColor: `color-mix(in oklch, var(--color-${accent}) 15%, transparent)`,
              color: `var(--color-${accent})`,
            }}
          >
            <Icon className="h-3 w-3" />
          </div>
          <span className="text-[12px] text-muted-foreground">{label}</span>
        </div>
        <div className="font-mono text-xl font-semibold tabular">{value}</div>
        <div className="mt-0.5 text-[12px] text-muted-foreground font-mono">{sub}</div>
      </CardContent>
    </Card>
  );
}
