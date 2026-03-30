import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Check, Zap, Sparkles, Cpu } from "lucide-react";
import { useSettings, useUpdateSettings } from "~/hooks/use-settings";
import {
  settingsFormSchema,
  supportedModels,
  modelLabels,
  thinkingEfforts,
  type SettingsFormValues,
} from "~/schemas/settings";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

const modelMeta: Record<
  (typeof supportedModels)[number],
  { context: string; icon: typeof Sparkles; accentClass: string }
> = {
  "claude-opus-4-6": {
    context: "1M context · Most capable",
    icon: Sparkles,
    accentClass: "model-opus",
  },
  "claude-sonnet-4-6": {
    context: "1M context · Balanced",
    icon: Zap,
    accentClass: "model-sonnet",
  },
  "claude-haiku-4-5": {
    context: "200K context · Fastest",
    icon: Cpu,
    accentClass: "model-haiku",
  },
};

function SettingsPage() {
  const { data, isLoading, isError } = useSettings();
  const update = useUpdateSettings();

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    values: data?.settings,
  });

  const thinkingEnabled = form.watch("thinkingEnabled");
  const selectedModel = form.watch("selectedModel");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-[13px] text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/40 px-4 py-6 text-center text-[13px] text-destructive">
        Failed to load settings.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 animate-fade-in">
      <h1 className="text-sm font-medium">Settings</h1>

      {update.isSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-[13px] text-success animate-slide-up">
          <Check className="h-3.5 w-3.5" />
          Saved.
        </div>
      )}

      <form onSubmit={form.handleSubmit((v) => update.mutate(v))} className="space-y-6">
        {/* Model */}
        <fieldset className="space-y-2">
          <legend className="text-[12px] text-muted-foreground">Model</legend>
          <div className="space-y-2">
            {supportedModels.map((model) => {
              const meta = modelMeta[model];
              const Icon = meta.icon;
              const isSelected = selectedModel === model;
              return (
                <button
                  key={model}
                  type="button"
                  onClick={() => form.setValue("selectedModel", model)}
                  className={cn(
                    "model-card group relative flex w-full items-center gap-3.5 rounded-lg px-4 py-3.5 text-left transition-all duration-200 cursor-pointer",
                    "border",
                    isSelected
                      ? "bg-card border-accent/50 shadow-[0_0_12px_-3px_var(--color-accent)] ring-1 ring-accent/20"
                      : "border-border/60 hover:border-border hover:bg-card/60",
                    meta.accentClass,
                  )}
                >
                  <div className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors duration-200",
                    isSelected
                      ? "bg-accent/15 text-accent"
                      : "bg-muted/60 text-muted-foreground group-hover:bg-muted group-hover:text-foreground/70",
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={cn(
                      "text-[13px] font-medium transition-colors",
                      isSelected ? "text-foreground" : "text-foreground/80 group-hover:text-foreground",
                    )}>
                      {modelLabels[model]}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                      {meta.context}
                    </div>
                  </div>
                  <div className={cn(
                    "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200",
                    isSelected
                      ? "border-accent bg-accent"
                      : "border-muted-foreground/40 group-hover:border-muted-foreground/70",
                  )}>
                    {isSelected && (
                      <div className="h-1.5 w-1.5 rounded-full bg-background" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Thinking */}
        <fieldset className="space-y-3">
          <legend className="text-[12px] text-muted-foreground">Extended Thinking</legend>
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={thinkingEnabled}
              onClick={() => form.setValue("thinkingEnabled", !thinkingEnabled)}
              className={cn(
                "relative h-5 w-9 rounded-full transition-colors cursor-pointer",
                thinkingEnabled ? "bg-foreground" : "bg-muted",
              )}
            >
              <span className={cn(
                "absolute top-0.5 left-0.5 h-4 w-4 rounded-full transition-transform bg-background",
                thinkingEnabled && "translate-x-4",
              )} />
            </button>
            <span className="text-[13px]">{thinkingEnabled ? "On" : "Off"}</span>
          </div>
        </fieldset>

        {/* Effort */}
        <fieldset className={cn("space-y-2 transition-opacity", !thinkingEnabled && "opacity-30 pointer-events-none")}>
          <legend className="text-[12px] text-muted-foreground">Effort</legend>
          <div className="inline-flex rounded-lg border border-border text-[12px] overflow-hidden">
            {thinkingEfforts.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => form.setValue("thinkingEffort", e)}
                className={cn(
                  "px-4 py-1.5 font-mono capitalize transition-all duration-200 cursor-pointer",
                  form.watch("thinkingEffort") === e
                    ? "bg-foreground text-background font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/60",
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={update.isPending}
          className="inline-flex h-8 items-center gap-2 rounded-md bg-foreground px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save
        </button>
      </form>
    </div>
  );
}
