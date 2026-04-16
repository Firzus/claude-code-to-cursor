import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Activity, Database, Radio } from "lucide-react";
import { FeatureCard } from "~/components/home/feature-card";
import { Hero } from "~/components/home/hero";
import { Ticker } from "~/components/home/ticker";

const STORAGE_KEY = "cctc:onboarding-complete";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const done = typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true";
    if (!done) throw redirect({ to: "/setup" });
  },
  component: HomePage,
});

function HomePage() {
  return (
    <div className="relative -mx-6 -my-8 min-h-[calc(100vh-3rem)] overflow-hidden px-6 py-8">
      <BackgroundDecoration />

      <div className="relative mx-auto max-w-5xl">
        <Hero />

        <Ticker />

        <section className="mt-4">
          <header className="mb-6 flex items-baseline justify-between">
            <div>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                What it does
              </h2>
              <p className="mt-2 text-[18px] font-semibold tracking-tight sm:text-[20px]">
                Three things. Nothing more.
              </p>
            </div>
            <Link
              to="/analytics"
              className="hidden sm:inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            >
              see it live
              <span aria-hidden="true">→</span>
            </Link>
          </header>

          <div className="grid gap-4 md:grid-cols-3">
            <FeatureCard
              index="01 · Translate"
              title="OpenAI ↔ Anthropic"
              description="Any OpenAI-compatible client speaks to Claude. Messages, tools, images, and streaming are rewritten on the fly — the only public model you need to know is 'Claude Code'."
              icon={Radio}
              items={["OpenAI chat completions", "Anthropic messages", "Responses API input"]}
              delay={60}
            />
            <FeatureCard
              index="02 · Cache"
              title="Four breakpoints, optimised"
              description="Prompt caching is placed precisely where it matters: last tool, last system block, 40% of user messages, and the second-to-last turn. Tool names sorted alphabetically for stable keys."
              icon={Database}
              items={["Stable cache keys", "TTL-safe rewrites", "Cost savings tracked"]}
              delay={120}
            />
            <FeatureCard
              index="03 · Observe"
              title="Every request, every token"
              description="A local SQLite ledger records latency, effort, and cache tokens per request. A daily budget endpoint estimates spend in USD — no external analytics, no leakage."
              icon={Activity}
              items={["UTC-day budget", "Thinking effort audit", "Rate-limit cache"]}
              delay={180}
            />
          </div>
        </section>

        <section className="mt-14 mb-8 rounded-lg border border-border bg-card/30 p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Ready to go
              </p>
              <h2 className="mt-2 text-[18px] font-semibold tracking-tight sm:text-[22px]">
                Point Cursor at the tunnel — that's it.
              </h2>
              <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">
                The setup wizard walks through OAuth, model selection, and the Cursor configuration
                snippet in four steps.
              </p>
            </div>
            <Link
              to="/setup"
              className="group inline-flex h-10 items-center gap-2 self-start rounded-md bg-accent px-5 text-[13px] font-medium text-accent-foreground transition-all hover:shadow-[0_0_0_4px_oklch(from_var(--color-accent)_l_c_h/0.18)]"
            >
              Open setup wizard
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function BackgroundDecoration() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 0%, oklch(from var(--color-accent) l c h / 0.14), transparent 55%), radial-gradient(circle at 85% 20%, oklch(from var(--color-chart-4) l c h / 0.10), transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "radial-gradient(circle, oklch(from var(--color-border) l c h / 0.9) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 80%)",
        }}
      />
    </div>
  );
}
