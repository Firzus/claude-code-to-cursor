import { Link, useRouterState } from "@tanstack/react-router";
import { Rocket, Menu, X } from "lucide-react";
import { useState } from "react";
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
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link to="/analytics" className="flex items-center gap-2">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="7 4 1 12 7 20" />
              <polyline points="17 4 23 12 17 20" />
              <line x1="8" y1="12" x2="16" y2="12" opacity="0.4" />
            </svg>
            <span className="text-sm font-semibold tracking-tight">
              claude-code-to-cursor
            </span>
          </Link>
          <span className="text-border hidden sm:inline">/</span>
          <nav className="hidden sm:flex items-center gap-1">
            {navItems.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[13px] transition-colors",
                  currentPath === to
                    ? "bg-card text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
          <Link
            to="/setup"
            className={cn(
              "hidden sm:flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] transition-colors",
              currentPath === "/setup"
                ? "text-accent bg-accent/10"
                : "text-muted-foreground hover:text-accent",
            )}
            title="Setup guide"
          >
            <Rocket className="h-3.5 w-3.5" />
            <span>Setup</span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <HealthIndicator />
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="sm:hidden rounded-md p-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-border bg-background/95 backdrop-blur-xl animate-slide-up">
          <nav className="flex flex-col p-3 gap-1">
            {navItems.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "rounded-md px-3 py-2 text-[13px] transition-colors",
                  currentPath === to
                    ? "bg-card text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50",
                )}
              >
                {label}
              </Link>
            ))}
            <Link
              to="/setup"
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] transition-colors",
                currentPath === "/setup"
                  ? "text-accent bg-accent/10"
                  : "text-muted-foreground hover:text-accent",
              )}
            >
              <Rocket className="h-3.5 w-3.5" />
              Setup
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
