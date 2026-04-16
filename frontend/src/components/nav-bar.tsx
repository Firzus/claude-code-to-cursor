import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, Rocket, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { HealthIndicator } from "./health-indicator";

const navItems = [
  { to: "/", label: "Home", search: undefined },
  { to: "/analytics", label: "Analytics", search: undefined },
  { to: "/settings", label: "Settings", search: undefined },
  { to: "/setup", label: "Auth", search: { step: "auth" as const } },
] as const;

export function NavBar() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const currentSearch = routerState.location.search as { step?: string };
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  function isActive(item: (typeof navItems)[number]) {
    if (item.to !== "/setup") return currentPath === item.to;
    return currentPath === "/setup" && currentSearch.step === "auth";
  }

  const isSetupWelcome = currentPath === "/setup" && currentSearch.step !== "auth";

  useEffect(() => {
    if (!mobileOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeMobile();
    }

    function handleClickOutside(e: MouseEvent) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        closeMobile();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [mobileOpen, closeMobile]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 rounded-md">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="7 4 1 12 7 20" />
              <polyline points="17 4 23 12 17 20" />
              <line x1="8" y1="12" x2="16" y2="12" opacity="0.4" />
            </svg>
            <span className="text-sm font-semibold tracking-tight">claude-code-to-cursor</span>
          </Link>
          <span className="text-border hidden sm:inline" aria-hidden="true">
            /
          </span>
          <nav className="hidden sm:flex items-center gap-1" aria-label="Main navigation">
            {navItems.map((item) => (
              <Link
                key={`${item.to}-${item.label}`}
                to={item.to}
                search={item.search}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[13px] transition-colors",
                  isActive(item)
                    ? "bg-card text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            to="/setup"
            className={cn(
              "hidden sm:flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] transition-colors",
              isSetupWelcome
                ? "text-accent bg-accent/10"
                : "text-muted-foreground hover:text-accent",
            )}
            title="Setup wizard"
          >
            <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Setup</span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <HealthIndicator />
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="sm:hidden rounded-md p-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          ref={mobileMenuRef}
          className="sm:hidden border-t border-border bg-background/95 backdrop-blur-xl animate-slide-up"
        >
          <nav className="flex flex-col p-3 gap-1" aria-label="Mobile navigation">
            {navItems.map((item) => (
              <Link
                key={`${item.to}-${item.label}-m`}
                to={item.to}
                search={item.search}
                onClick={closeMobile}
                className={cn(
                  "rounded-md px-3 py-2 text-[13px] transition-colors",
                  isActive(item)
                    ? "bg-card text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50",
                )}
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/setup"
              onClick={closeMobile}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] transition-colors",
                isSetupWelcome
                  ? "text-accent bg-accent/10"
                  : "text-muted-foreground hover:text-accent",
              )}
            >
              <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
              Setup
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
