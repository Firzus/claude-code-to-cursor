"use client";

import { useGSAP } from "@gsap/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useTransition } from "react";
import { cn } from "~/lib/cn";
import { ensureGsapPlugins, gsap, withReducedMotion } from "~/lib/motion";
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

  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  function set(period: Period) {
    const params = new URLSearchParams(search);
    if (period === "day") params.delete("period");
    else params.set("period", period);
    params.delete("page");
    const url = params.size ? `${pathname}?${params.toString()}` : pathname;
    startTransition(() => router.replace(url, { scroll: false }));
  }

  useGSAP(
    () => {
      ensureGsapPlugins();
      const list = listRef.current;
      const indicator = indicatorRef.current;
      if (!list || !indicator) return;

      const activeBtn = list.querySelector<HTMLButtonElement>(`[data-period="${value}"]`);
      if (!activeBtn) return;

      const listRect = list.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      const targetX = btnRect.left - listRect.left;
      const targetW = btnRect.width;

      return withReducedMotion((isMotion) => {
        gsap.to(indicator, {
          x: targetX,
          width: targetW,
          duration: isMotion ? 0.3 : 0,
          ease: "power3.out",
          autoAlpha: 1,
        });
      });
    },
    { scope: listRef, dependencies: [value] },
  );

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Time period"
      className={cn(
        "relative inline-flex items-center gap-1 rounded-full border bg-card p-1 text-sm shadow-(--shadow-soft-xs)",
        pending && "opacity-90",
      )}
    >
      <span
        ref={indicatorRef}
        aria-hidden="true"
        className="absolute left-0 top-1 bottom-1 rounded-full bg-foreground opacity-0 pointer-events-none"
      />
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            type="button"
            role="tab"
            data-period={item.value}
            aria-selected={active}
            key={item.value}
            onClick={() => set(item.value)}
            className={cn(
              "relative z-10 rounded-full px-3 py-1 text-xs font-medium tabular",
              "transition-colors duration-150 ease-out",
              active ? "text-background" : "text-muted-foreground hover-only:hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
