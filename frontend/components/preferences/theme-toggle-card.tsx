"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "~/lib/cn";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeToggleCard() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <section
      aria-label="Theme"
      className="grid gap-6 rounded-xl border bg-card px-6 py-8 md:grid-cols-[1fr_2fr] md:gap-10 md:px-10 md:py-10"
    >
      <div>
        <span className="eyebrow">Appearance</span>
        <h3 className="font-display mt-3 text-2xl leading-tight tracking-tight">Theme</h3>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Pure light or quiet ink — match your editor.
        </p>
      </div>
      <div role="radiogroup" className="grid grid-cols-3 gap-2">
        {options.map(({ value, label, icon: Icon }) => {
          const active = mounted && theme === value;
          return (
            <button
              type="button"
              key={value}
              onClick={() => setTheme(value)}
              aria-pressed={active}
              className={cn(
                "flex flex-col items-start gap-2 rounded-lg border p-4 text-left outline-none",
                "transition-[background-color,border-color,transform] duration-150 ease-out",
                "focus-visible:ring-2 focus-visible:ring-ring/60",
                active
                  ? "border-primary/40 bg-primary/[0.04]"
                  : "border-border hover-only:hover:border-foreground/20 hover-only:hover:bg-accent/40 hover-only:hover:-translate-y-px",
              )}
            >
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border",
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                <Icon className="size-3.5" />
              </span>
              <span className="text-sm font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
