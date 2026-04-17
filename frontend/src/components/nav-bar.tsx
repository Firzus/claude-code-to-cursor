import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { HealthIndicator } from "./health-indicator";

const navItems = [
  { to: "/", label: "home", path: "~" },
  { to: "/analytics", label: "analytics", path: "~/analytics" },
  { to: "/settings", label: "settings", path: "~/settings" },
  { to: "/setup", label: "setup", path: "~/setup" },
] as const;

type NavItem = (typeof navItems)[number];

export function NavBar() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  function isActive(item: NavItem) {
    if (item.to === "/") return currentPath === "/";
    return currentPath === item.to;
  }

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
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6 font-mono">
        <div className="flex items-center gap-6 min-w-0">
          <Link
            to="/"
            aria-label="claude-code-to-cursor home"
            className="flex shrink-0 items-center gap-2 rounded-sm text-foreground transition-colors hover:text-foreground/80"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-6 w-6 items-center justify-center rounded-sm border border-border/80 bg-card/60 text-[11px] leading-none tracking-[-0.04em]"
            >
              cc
            </span>
            <span className="text-[12.5px] font-medium tracking-tight">
              claude<span className="text-muted-foreground">_</span>code
              <span className="text-muted-foreground/50 mx-1">↪</span>
              cursor
            </span>
          </Link>

          <nav className="hidden sm:flex items-center gap-0.5" aria-label="Main navigation">
            {navItems.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "relative flex h-7 items-center rounded-sm px-2.5 text-[12px] transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 right-0 -bottom-[13px] h-px bg-foreground"
                    />
                  )}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <HealthIndicator />
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="sm:hidden rounded-sm p-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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
          className="sm:hidden border-t border-border/70 bg-background/95 backdrop-blur-xl animate-slide-up font-mono"
        >
          <nav className="flex flex-col p-3 gap-0.5" aria-label="Mobile navigation">
            {navItems.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={closeMobile}
                  className={cn(
                    "flex items-center justify-between rounded-sm px-3 py-2 text-[12px] transition-colors min-h-[44px]",
                    active
                      ? "bg-card/60 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-card/40",
                  )}
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] text-muted-foreground/60 tracking-[0.14em]">
                    {item.path}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
