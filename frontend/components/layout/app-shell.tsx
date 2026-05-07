"use client";

import { Activity, BarChart3, Plug, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { StatusPill } from "~/components/layout/status-pill";
import { ThemeToggle } from "~/components/layout/theme-toggle";
import { cn } from "~/lib/cn";
import type { Health } from "~/lib/schemas";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Activity;
}

const navItems: NavItem[] = [
  { href: "/", label: "Overview", icon: Activity },
  { href: "/usage", label: "Usage", icon: BarChart3 },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/preferences", label: "Preferences", icon: Settings2 },
];

interface AppShellProps {
  children: ReactNode;
  appName: string;
  initialHealth?: Health;
}

export function AppShell({ children, appName, initialHealth }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-6">
          <Link href="/" className="group flex items-center gap-3" aria-label={`${appName} home`}>
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-md bg-foreground text-background transition-transform group-hover:scale-[0.96]"
            >
              <span className="font-display text-[15px] leading-none italic">c</span>
            </span>
            <span className="font-display text-base leading-none tracking-tight">
              {appName.split(" ").slice(0, 1).join(" ")}
              <span className="text-muted-foreground"> · proxy</span>
            </span>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
            {navItems.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <StatusPill initial={initialHealth} />
            <ThemeToggle />
          </div>
        </div>
        <nav
          className="flex w-full justify-center gap-1 border-t bg-background/40 px-4 py-2 md:hidden"
          aria-label="Primary"
        >
          {navItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 md:py-14">{children}</main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <span>{appName}</span>
          <span className="font-mono tabular">{new Date().getUTCFullYear()} · self-hosted</span>
        </div>
      </footer>
    </div>
  );
}
