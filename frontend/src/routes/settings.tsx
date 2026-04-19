import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute } from "@tanstack/react-router";
import { Cpu, CreditCard, RotateCcw, Sparkles, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { PageHeader, type PageHeaderStatus } from "~/components/page-header";
import { EffortStrip } from "~/components/settings/effort-strip";
import { Panel, PanelRow } from "~/components/settings/panel";
import { SelectorRow } from "~/components/settings/selector-row";
import { ToggleAscii } from "~/components/settings/toggle-ascii";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
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
  dataModel: "opus" | "sonnet" | "haiku";
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
    dataModel: "opus",
  },
  "claude-opus-4-6": {
    id: "opus_4_6",
    context: "1M ctx",
    capability: "previous flagship",
    icon: Sparkles,
    dataModel: "opus",
  },
  "claude-sonnet-4-6": {
    id: "sonnet_4_6",
    context: "200K ctx",
    capability: "balanced",
    icon: Zap,
    dataModel: "sonnet",
  },
  "claude-haiku-4-5": {
    id: "haiku_4_5",
    context: "200K ctx",
    capability: "fastest",
    icon: Cpu,
    dataModel: "haiku",
  },
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toString();
}

function statusFromState(
  state: "loading" | "error" | "saved" | "dirty" | "clean",
  savedAgo: number,
): PageHeaderStatus {
  switch (state) {
    case "loading":
      return { tone: "muted", label: "loading", pulse: true };
    case "error":
      return { tone: "destructive", label: "error" };
    case "saved":
      return {
        tone: "success",
        label: savedAgo === 0 ? "saved · just now" : `saved · ${savedAgo}s ago`,
      };
    case "dirty":
      return { tone: "warning", label: "unsaved changes", pulse: true };
    default:
      return { tone: "success", label: "synced" };
  }
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

  const headerTitle = (
    <>
      settings<span className="text-muted-foreground">.control</span>
    </>
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
        <PageHeader
          eyebrow="~/settings"
          title={headerTitle}
          version="v1"
          status={statusFromState("loading", 0)}
        />
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
        <PageHeader
          eyebrow="~/settings"
          title={headerTitle}
          version="v1"
          status={statusFromState("error", 0)}
        />
        <Alert
          variant="error"
          title="settings.unreachable"
          description="Failed to load settings. The settings API is offline or returned an error."
          action={
            <Button
              variant="secondary"
              size="sm"
              leading={<RotateCcw className="h-3 w-3" aria-hidden="true" />}
              onClick={() => refetch()}
            >
              try again
            </Button>
          }
        />
      </div>
    );
  }

  const status = statusFromState(showSuccess ? "saved" : isDirty ? "dirty" : "clean", savedAgo);

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <PageHeader eyebrow="~/settings" title={headerTitle} version="v1" status={status} />

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
                  dataModel={meta.dataModel}
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
              "mt-3 flex items-start gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 font-mono text-[11px] leading-relaxed transition-opacity",
              !thinkingEnabled && "opacity-40",
            )}
          >
            <span aria-hidden="true" className="text-accent select-none">
              &gt;
            </span>
            <span className="text-muted-foreground">
              {effortDescriptions[selectedEffort ?? "high"]}
            </span>
          </div>
        </Panel>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-5">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {update.isPending ? "$ saving···" : "$ save"}
          </span>
          <div className="flex items-center gap-3">
            {isDirty && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => form.reset()}
                className="uppercase tracking-[0.18em] text-[11px]"
              >
                discard
              </Button>
            )}
            <Button
              type="submit"
              variant="terminal"
              size="md"
              disabled={update.isPending || !isDirty}
              isLoading={update.isPending}
              loadingText="saving"
              leading={<span aria-hidden="true">█</span>}
            >
              save
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
