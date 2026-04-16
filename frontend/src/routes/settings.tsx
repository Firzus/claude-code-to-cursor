import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute } from "@tanstack/react-router";
import { Cpu, CreditCard, RotateCcw, Sparkles, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { EffortStrip } from "~/components/settings/effort-strip";
import { Panel, PanelRow } from "~/components/settings/panel";
import { SelectorRow } from "~/components/settings/selector-row";
import { ToggleAscii } from "~/components/settings/toggle-ascii";
import { useSettings, useUpdateSettings } from "~/hooks/use-settings";
import { cn } from "~/lib/utils";
import {
  modelLabels,
  planLabels,
  planPrices,
  planQuotas,
  type SettingsFormValues,
  settingsFormSchema,
  supportedModels,
  supportedPlans,
  thinkingEfforts,
} from "~/schemas/settings";

type ModelMeta = {
  id: string;
  context: string;
  capability: string;
  icon: typeof Sparkles;
  accentClass: string;
};

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

const effortDescriptions: Record<(typeof thinkingEfforts)[number], string> = {
  low: "Efficient. Best for short, scoped tasks.",
  medium: "Balanced. Good default for general workloads.",
  high: "Advanced use cases needing a balance of intelligence and token cost.",
  xhigh: "Coding & long-horizon agentic work. Higher token usage (Opus 4.7 only).",
  max: "Frontier problems requiring the deepest possible reasoning.",
};

const modelMeta: Record<(typeof supportedModels)[number], ModelMeta> = {
  "claude-opus-4-7": {
    id: "opus_4_7",
    context: "1M ctx",
    capability: "most capable",
    icon: Sparkles,
    accentClass: "selector-opus",
  },
  "claude-sonnet-4-6": {
    id: "sonnet_4_6",
    context: "200K ctx",
    capability: "balanced",
    icon: Zap,
    accentClass: "selector-sonnet",
  },
  "claude-haiku-4-5": {
    id: "haiku_4_5",
    context: "200K ctx",
    capability: "fastest",
    icon: Cpu,
    accentClass: "selector-haiku",
  },
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toString();
}

function SettingsPage() {
  const { data, isLoading, isError, refetch } = useSettings();
  const update = useUpdateSettings();
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [savedAgo, setSavedAgo] = useState(0);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    values: data?.settings,
  });

  const thinkingEnabled = form.watch("thinkingEnabled");
  const selectedModel = form.watch("selectedModel");
  const selectedPlan = form.watch("subscriptionPlan");
  const selectedEffort = form.watch("thinkingEffort");
  const isDirty = form.formState.isDirty;

  useEffect(() => {
    if (update.isSuccess) {
      setShowSuccess(true);
      setSavedAt(Date.now());
      const t = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(t);
    }
  }, [update.isSuccess]);

  useEffect(() => {
    if (savedAt === null) return;
    const id = setInterval(() => {
      setSavedAgo(Math.max(0, Math.floor((Date.now() - savedAt) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [savedAt]);

  const onBeforeUnload = useCallback(
    (e: BeforeUnloadEvent) => {
      if (isDirty) e.preventDefault();
    },
    [isDirty],
  );

  useEffect(() => {
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [onBeforeUnload]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
        <PageHeader status="loading" />
        {[
          { id: "skel-01", index: "01", title: "model" },
          { id: "skel-02", index: "02", title: "subscription" },
          { id: "skel-03", index: "03", title: "thinking" },
        ].map((p, i) => (
          <Panel key={p.id} index={`${p.index} ·`} title={p.title} hint="loading" delay={i * 60}>
            <div className="flex items-center gap-2 py-6 font-mono text-[12px] text-muted-foreground">
              <span aria-hidden="true" className="animate-pulse">
                ···
              </span>
              <span className="uppercase tracking-[0.18em] text-[10.5px]">fetching</span>
            </div>
          </Panel>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
        <PageHeader status="error" />
        <Panel
          index="ERR ·"
          title="settings.unreachable"
          hint="api offline"
          footer={
            <>
              <span>$ retry</span>
              <span className="text-destructive">exit 1</span>
            </>
          }
        >
          <div className="flex flex-col items-start gap-4 py-3">
            <p className="text-[12.5px] text-destructive font-mono">Failed to load settings.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-border/70 bg-card/40 px-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              Try again
            </button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <PageHeader
        status={showSuccess ? "saved" : isDirty ? "dirty" : "clean"}
        savedAgo={savedAgo}
      />

      <span className="sr-only" aria-live="polite">
        Settings
      </span>

      <form onSubmit={form.handleSubmit((v) => update.mutate(v))} className="space-y-6">
        {/* Model panel */}
        <Panel
          index="01 ·"
          title="model"
          hint="ctx · capability"
          footer={
            <>
              <span>$ select model</span>
              <span className="text-muted-foreground/70">{modelMeta[selectedModel]?.id}</span>
            </>
          }
        >
          <div role="radiogroup" aria-label="Claude model" className="-mx-1 space-y-0.5">
            {supportedModels.map((model) => {
              const meta = modelMeta[model];
              return (
                <SelectorRow
                  key={model}
                  id={meta.id}
                  name={modelLabels[model]}
                  meta={`${meta.context} · ${meta.capability}`}
                  selected={selectedModel === model}
                  onSelect={() => form.setValue("selectedModel", model, { shouldDirty: true })}
                  icon={meta.icon}
                  accentClass={meta.accentClass}
                  ariaLabel={modelLabels[model]}
                />
              );
            })}
          </div>
        </Panel>

        {/* Subscription panel */}
        <Panel
          index="02 ·"
          title="subscription"
          hint="window · weekly"
          footer={
            <>
              <span>$ select plan</span>
              <span className="text-muted-foreground/70">{selectedPlan ?? "—"}</span>
            </>
          }
        >
          <p className="mb-3 px-1 text-[11.5px] text-muted-foreground leading-relaxed">
            Used to estimate plan consumption on Analytics. Anthropic does not expose this via OAuth
            — set it manually.
          </p>
          <div role="radiogroup" aria-label="Subscription plan" className="-mx-1 space-y-0.5">
            {supportedPlans.map((plan) => {
              const q = planQuotas[plan];
              const meta = `${planPrices[plan]} · ${formatTokens(q.fiveHourTokens)}/5h · ${formatTokens(q.weeklyTokens)}/wk`;
              return (
                <SelectorRow
                  key={plan}
                  id={plan}
                  name={planLabels[plan]}
                  meta={meta}
                  selected={selectedPlan === plan}
                  onSelect={() => form.setValue("subscriptionPlan", plan, { shouldDirty: true })}
                  icon={CreditCard}
                  ariaLabel={planLabels[plan]}
                />
              );
            })}
          </div>
        </Panel>

        {/* Thinking panel */}
        <Panel
          index="03 ·"
          title="thinking"
          hint="chain-of-thought · effort"
          footer={
            <>
              <span>$ effort {thinkingEnabled ? selectedEffort : "—"}</span>
              <span
                className={cn(
                  "uppercase tracking-[0.2em]",
                  thinkingEnabled ? "text-accent" : "text-muted-foreground/60",
                )}
              >
                {thinkingEnabled ? "engaged" : "off"}
              </span>
            </>
          }
        >
          <span className="sr-only">Extended Thinking</span>
          <PanelRow label="status">
            <ToggleAscii
              checked={thinkingEnabled}
              onChange={(next) => form.setValue("thinkingEnabled", next, { shouldDirty: true })}
              ariaLabel="Toggle extended thinking"
            />
          </PanelRow>
          <PanelRow label="effort">
            <div className="w-full max-w-[420px]">
              <EffortStrip
                options={thinkingEfforts}
                value={selectedEffort ?? "high"}
                onChange={(next) => form.setValue("thinkingEffort", next, { shouldDirty: true })}
                disabled={!thinkingEnabled}
              />
            </div>
          </PanelRow>
          <div
            className={cn(
              "mt-3 flex items-start gap-2 rounded-md border border-border/40 bg-background/40 px-3 py-2 font-mono text-[11px] leading-relaxed transition-opacity",
              !thinkingEnabled && "opacity-40",
            )}
          >
            <span aria-hidden="true" className="text-accent select-none">
              {">"}
            </span>
            <span className="text-muted-foreground">
              {effortDescriptions[selectedEffort ?? "high"]}
            </span>
          </div>
        </Panel>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-border/60 pt-5">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {update.isPending ? "$ saving···" : "$ save"}
          </span>
          <div className="flex items-center gap-3">
            {isDirty && (
              <button
                type="button"
                onClick={() => form.reset()}
                className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
              >
                discard
              </button>
            )}
            <button
              type="submit"
              disabled={update.isPending || !isDirty}
              className={cn(
                "group inline-flex h-9 items-center gap-2 rounded-md border border-foreground/80 bg-foreground px-5 font-mono text-[12px] font-medium text-background transition-all",
                "hover:bg-foreground/95 hover:shadow-[0_0_0_4px_oklch(from_var(--color-foreground)_l_c_h/0.12)]",
                "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none",
                !update.isPending && isDirty && "cursor-pointer",
              )}
            >
              <span aria-hidden="true">{update.isPending ? "▒" : "█"}</span>
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function PageHeader({
  status,
  savedAgo = 0,
}: {
  status: "loading" | "error" | "saved" | "dirty" | "clean";
  savedAgo?: number;
}) {
  const badge = (() => {
    switch (status) {
      case "loading":
        return { text: "loading", dot: "bg-muted-foreground/40" };
      case "error":
        return { text: "error", dot: "bg-destructive" };
      case "saved":
        return {
          text: savedAgo === 0 ? "saved · just now" : `saved · ${savedAgo}s ago`,
          dot: "bg-success",
        };
      case "dirty":
        return { text: "unsaved changes", dot: "bg-warning animate-pulse" };
      default:
        return { text: "synced", dot: "bg-success/60" };
    }
  })();

  return (
    <header className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-4 font-mono">
      <div className="flex items-baseline gap-3 min-w-0">
        <span aria-hidden="true" className="text-muted-foreground/50">
          ↳
        </span>
        <h1 className="text-[18px] sm:text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          settings
          <span className="text-muted-foreground">.control</span>
        </h1>
        <span className="hidden sm:inline text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground/60">
          v1
        </span>
      </div>
      <span className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.18em]">
        <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", badge.dot)} />
        <span className="text-muted-foreground">{badge.text}</span>
      </span>
    </header>
  );
}
