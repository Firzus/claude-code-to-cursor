import { Link, useRouterState } from "@tanstack/react-router";
import { Rocket } from "lucide-react";
import { cn } from "~/lib/utils";
import { HealthIndicator } from "./health-indicator";

const navItems = [
  { to: "/analytics", label: "Analytics" },
  { to: "/settings", label: "Settings" },
  { to: "/login", label: "Auth" },
] as const;

export function NavBar() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link to="/analytics" className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="7 4 1 12 7 20" />
              <polyline points="17 4 23 12 17 20" />
              <line x1="8" y1="12" x2="16" y2="12" opacity="0.4" />
            </svg>
            <span className="text-sm font-semibold tracking-tight">
              ccproxy
            </span>
          </Link>
          <span className="text-border">/</span>
          <nav className="flex items-center gap-1">
            {navItems.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[13px] transition-colors",
                  currentPath === to
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
          <Link
            to="/setup"
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] transition-colors",
              currentPath === "/setup"
                ? "text-accent"
                : "text-muted-foreground hover:text-accent",
            )}
            title="Setup guide"
          >
            <Rocket className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Setup</span>
          </Link>
        </div>
        <HealthIndicator />
      </div>
    </header>
  );
}
