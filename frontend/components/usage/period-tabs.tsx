"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "~/lib/cn";
import type { Period } from "~/lib/schemas";

const items: { value: Period; label: string }[] = [
  { value: "5hour", label: "5h" },
  { value: "day", label: "24h" },
  { value: "week", label: "7d" },
  { value: "month", label: "30d" },
  { value: "all", label: "All" },
];

export function PeriodTabs({ value }: { value: Period }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();

  function set(period: Period) {
    const params = new URLSearchParams(search);
    if (period === "day") params.delete("period");
    else params.set("period", period);
    params.delete("page");
    const url = params.size ? `${pathname}?${params.toString()}` : pathname;
    startTransition(() => router.replace(url, { scroll: false }));
  }

  return (
    <div
      role="tablist"
      aria-label="Time period"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border bg-card p-1 text-sm shadow-(--shadow-soft-xs)",
        pending && "opacity-90",
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            type="button"
            role="tab"
            aria-selected={active}
            key={item.value}
            onClick={() => set(item.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors tabular",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
