"use client";

import { Activity, BarChart3, Plug, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { StatusPill } from "~/components/layout/status-pill";
import { cn } from "~/lib/cn";

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
}

export function AppShell({ children, appName }: AppShellProps) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <header
        data-scrolled={scrolled || undefined}
        className={cn(
          "sticky top-0 z-40 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70",
          "border-b border-transparent transition-[border-color,box-shadow] duration-200",
          "data-[scrolled]:border-border data-[scrolled]:shadow-[0_1px_0_0_var(--color-border)]",
        )}
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
          <Link
            href="/"
            className="group flex items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            aria-label={`${appName} home`}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-8 items-center justify-center rounded-md bg-foreground text-background",
                "transition-transform duration-200 ease-out hover-only:group-hover:scale-[0.97] hover-only:group-hover:rotate-[-3deg]",
                "motion-reduce:transition-none motion-reduce:hover-only:group-hover:scale-100 motion-reduce:hover-only:group-hover:rotate-0",
              )}
            >
              <span className="font-display text-[15px] leading-none italic">c</span>
            </span>
            <span className="hidden font-display text-base leading-none tracking-tight sm:inline-block">
              {appName.split(" ").slice(0, 1).join(" ")}
              <span className="text-muted-foreground"> · proxy</span>
            </span>
          </Link>

          <nav
            className="hidden flex-1 items-center justify-center gap-1 md:flex"
            aria-label="Primary"
          >
            {navItems.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-nav-active={active}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm",
                    "transition-colors duration-150 ease-out",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover-only:hover:bg-muted hover-only:hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <StatusPill />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 md:px-6 md:py-14 pb-24 md:pb-14">
        {children}
      </main>

      {/* Mobile bottom navigation */}
      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 md:hidden",
          "border-t border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75",
          "pb-[env(safe-area-inset-bottom)]",
        )}
        aria-label="Primary mobile"
      >
        <ul className="mx-auto flex w-full max-w-6xl items-stretch justify-between gap-1 px-2 py-1.5">
          {navItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex flex-1">
                <Link
                  href={item.href}
                  data-nav-active={active}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2",
                    "min-h-11 text-[11px] font-medium tracking-tight",
                    "transition-colors duration-150 ease-out",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover-only:hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "relative flex size-7 items-center justify-center rounded-full",
                      "transition-transform duration-200 ease-out",
                      active && "bg-foreground text-background scale-105",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" strokeWidth={active ? 2.4 : 1.8} />
                  </span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <footer className="border-t hidden md:block">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground">
          <span>{appName}</span>
          <span className="font-mono tabular">{new Date().getUTCFullYear()} · self-hosted</span>
        </div>
      </footer>
    </div>
  );
}
