import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Activity, ArrowUpRight, Database, Radio, Rocket } from "lucide-react";
import { FeatureTile } from "~/components/feature-tile";
import { Hero } from "~/components/home/hero";
import { Ticker } from "~/components/home/ticker";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";

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
          <header className="mb-6 flex items-baseline justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
                <span aria-hidden="true" className="text-muted-foreground/60">
                  {"//"}
                </span>
                what it does
              </div>
              <p className="mt-2 font-mono text-[18px] font-semibold tracking-[-0.01em] sm:text-[20px]">
                three things. nothing more.
              </p>
            </div>
            <Link
              to="/analytics"
              className="hidden sm:inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            >
              see it live
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </header>

          <div className="grid gap-4 md:grid-cols-3">
            <FeatureTile
              index="01 · translate"
              title="openai ↔ anthropic"
              description="Any OpenAI-compatible client speaks to Claude. Messages, tools, images, and streaming are rewritten on the fly — the only public model you need to know is 'claude-code'."
              icon={Radio}
              items={["OpenAI chat completions", "Anthropic messages", "Responses API input"]}
              delay={60}
            />
            <FeatureTile
              index="02 · cache"
              title="four breakpoints, optimised"
              description="Prompt caching is placed precisely where it matters: last tool, last system block, 40% of user messages, and the second-to-last turn. Tool names sorted alphabetically for stable keys."
              icon={Database}
              items={["Stable cache keys", "TTL-safe rewrites", "Cost savings tracked"]}
              delay={120}
            />
            <FeatureTile
              index="03 · observe"
              title="every request, every token"
              description="A local SQLite ledger records latency, effort, and cache tokens per request. A daily budget endpoint estimates spend in USD — no external analytics, no leakage."
              icon={Activity}
              items={["UTC-day budget", "Thinking effort audit", "Rate-limit cache"]}
              delay={180}
            />
          </div>
        </section>

        <section className="mt-14 mb-8">
          <Card variant="terminal" padding="lg" delay={240} className="sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
                  <span aria-hidden="true" className="text-accent">
                    ↳
                  </span>
                  ready to go
                </div>
                <h2 className="mt-2 font-mono text-[18px] font-semibold tracking-[-0.01em] sm:text-[22px]">
                  point cursor at the tunnel — that's it.
                </h2>
                <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                  The setup wizard walks through OAuth, model selection, and the Cursor
                  configuration snippet in four steps.
                </p>
              </div>
              <Button
                asChild
                variant="accent"
                size="md"
                leading={<Rocket className="h-3.5 w-3.5" aria-hidden="true" />}
                trailing={
                  <span
                    aria-hidden="true"
                    className="transition-transform group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                }
                className="self-start"
              >
                <Link to="/setup">open setup wizard</Link>
              </Button>
            </div>
          </Card>
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
