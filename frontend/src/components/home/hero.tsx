import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Rocket } from "lucide-react";
import { StatusPanel } from "./status-panel";

export function Hero() {
  return (
    <section className="relative grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:items-end pt-4 sm:pt-10">
      <div className="relative flex flex-col">
        <div
          className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground animate-fade-in"
          style={{ animationDelay: "40ms" }}
        >
          <span
            aria-hidden="true"
            className="inline-block h-px w-8 bg-gradient-to-r from-transparent to-border"
          />
          <span>oauth proxy · v1</span>
        </div>

        <h1
          className="mt-5 font-mono font-semibold leading-[0.92] tracking-[-0.04em] text-[clamp(2.5rem,7vw,5.25rem)] animate-slide-up"
          style={{ animationDelay: "80ms" }}
        >
          <span className="block text-foreground">claude_code</span>
          <span className="block text-muted-foreground">
            <span aria-hidden="true" className="inline-block -translate-y-[0.08em] text-accent">
              ↳
            </span>{" "}
            <span className="text-foreground">cursor</span>
            <span
              aria-hidden="true"
              className="ml-1 inline-block h-[0.72em] w-[0.35em] translate-y-[0.05em] bg-accent animate-[caret_1.1s_steps(2)_infinite]"
            />
          </span>
        </h1>

        <p
          className="mt-7 max-w-xl text-[15px] leading-relaxed text-muted-foreground animate-fade-in"
          style={{ animationDelay: "160ms" }}
        >
          An OAuth-authenticated proxy that routes any OpenAI- or Anthropic-compatible client
          through Claude Code. Token refresh, cache-optimised prompts, and request analytics —
          without exposing a single API key.
        </p>

        <div
          className="mt-9 flex flex-wrap items-center gap-3 animate-fade-in"
          style={{ animationDelay: "220ms" }}
        >
          <Link
            to="/setup"
            className="group inline-flex h-10 items-center gap-2 rounded-md bg-foreground px-5 text-[13px] font-medium text-background transition-all hover:shadow-[0_0_0_4px_oklch(from_var(--color-foreground)_l_c_h/0.15)]"
          >
            <Rocket className="h-4 w-4" aria-hidden="true" />
            Start setup
            <span
              aria-hidden="true"
              className="ml-1 text-[16px] leading-none transition-transform group-hover:translate-x-0.5"
            >
              →
            </span>
          </Link>
          <Link
            to="/analytics"
            className="group inline-flex h-10 items-center gap-2 rounded-md border border-border px-5 text-[13px] font-medium text-foreground transition-colors hover:bg-card"
          >
            Open analytics
            <ArrowUpRight
              className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
              aria-hidden="true"
            />
          </Link>
          <Link
            to="/settings"
            className="inline-flex h-10 items-center px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Model settings
          </Link>
        </div>

        <dl
          className="mt-10 grid grid-cols-3 gap-6 max-w-md border-t border-border pt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground animate-fade-in"
          style={{ animationDelay: "280ms" }}
        >
          <div>
            <dt>ctx</dt>
            <dd className="mt-1 text-foreground text-[15px] tracking-tight normal-case">1M</dd>
          </div>
          <div>
            <dt>cache breakpoints</dt>
            <dd className="mt-1 text-foreground text-[15px] tracking-tight normal-case">4</dd>
          </div>
          <div>
            <dt>auth</dt>
            <dd className="mt-1 text-foreground text-[15px] tracking-tight normal-case">PKCE</dd>
          </div>
        </dl>
      </div>

      <div className="lg:pl-4">
        <StatusPanel />
      </div>
    </section>
  );
}
