"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Card, CardContent } from "~/components/ui/card";
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
    <Card className="border-none shadow-(--shadow-soft-md)">
      <CardContent className="grid gap-6 px-6 md:grid-cols-[1fr_2fr] md:px-10">
        <div>
          <span className="eyebrow">Appearance</span>
          <h3 className="font-display mt-2 text-2xl tracking-tight">Theme</h3>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Cream paper or quiet ink. Match your editor.
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
                className={cn(
                  "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
                  active ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/40",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full",
                    active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="text-sm font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
