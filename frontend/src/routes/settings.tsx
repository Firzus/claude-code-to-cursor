import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, Check, Cpu, Loader2, RotateCcw, Sparkles, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { useSettings, useUpdateSettings } from "~/hooks/use-settings";
import { cn } from "~/lib/utils";
import {
  modelLabels,
  type SettingsFormValues,
  settingsFormSchema,
  supportedModels,
  thinkingEfforts,
} from "~/schemas/settings";

type ModelMeta = { context: string; icon: typeof Sparkles; accentClass: string };

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

const modelMeta: Record<(typeof supportedModels)[number], ModelMeta> = {
  "claude-opus-4-7": {
    context: "1M context · Most capable",
    icon: Sparkles,
    accentClass: "model-opus",
  },
  "claude-sonnet-4-6": {
    context: "200K context · Balanced",
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
  const { data, isLoading, isError, refetch } = useSettings();
  const update = useUpdateSettings();
  const [showSuccess, setShowSuccess] = useState(false);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    values: data?.settings,
  });

  const thinkingEnabled = form.watch("thinkingEnabled");
  const selectedModel = form.watch("selectedModel");
  const isDirty = form.formState.isDirty;

  useEffect(() => {
    if (update.isSuccess) {
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(t);
    }
  }, [update.isSuccess]);

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
      <div className="mx-auto max-w-lg space-y-6 animate-fade-in">
        <Skeleton className="h-5 w-20" />
        <Card>
          <CardContent className="p-5 space-y-4">
            {["skel-1", "skel-2", "skel-3"].map((id) => (
              <Skeleton key={id} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-40" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-lg animate-fade-in">
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-3 py-10">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <span className="text-[13px] text-destructive">Failed to load settings.</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Try again
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-medium">Settings</h1>
        {isDirty && (
          <Badge variant="warning" className="text-[11px] animate-slide-up">
            Unsaved changes
          </Badge>
        )}
      </div>

      {showSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-[13px] text-success animate-slide-up">
          <Check className="h-3.5 w-3.5" />
          Saved.
        </div>
      )}

      <form onSubmit={form.handleSubmit((v) => update.mutate(v))} className="space-y-5">
        {/* Model */}
        <Card>
          <CardHeader className="p-4 pb-3">
            <CardTitle className="text-[13px]">Model</CardTitle>
            <CardDescription className="text-[12px]">
              Select the Claude model used for all requests
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-2">
            {supportedModels.map((model) => {
              const meta = modelMeta[model] as ModelMeta;
              const Icon = meta.icon;
              const isSelected = selectedModel === model;
              return (
                <button
                  key={model}
                  type="button"
                  onClick={() => form.setValue("selectedModel", model, { shouldDirty: true })}
                  className={cn(
                    "model-card group relative flex w-full items-center gap-3.5 rounded-lg px-4 py-3.5 text-left transition-all duration-200 cursor-pointer",
                    "border",
                    isSelected
                      ? "bg-card border-accent/50 shadow-[0_0_12px_-3px_var(--color-accent)] ring-1 ring-accent/20"
                      : "border-border/60 hover:border-border hover:bg-card/60",
                    meta.accentClass,
                  )}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors duration-200",
                      isSelected
                        ? "bg-accent/15 text-accent"
                        : "bg-muted/60 text-muted-foreground group-hover:bg-muted group-hover:text-foreground/70",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "text-[13px] font-medium transition-colors",
                        isSelected
                          ? "text-foreground"
                          : "text-foreground/80 group-hover:text-foreground",
                      )}
                    >
                      {modelLabels[model]}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                      {meta.context}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200",
                      isSelected
                        ? "border-accent bg-accent"
                        : "border-muted-foreground/40 group-hover:border-muted-foreground/70",
                    )}
                  >
                    {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-background" />}
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Thinking */}
        <Card>
          <CardHeader className="p-4 pb-3">
            <CardTitle className="text-[13px]">Extended Thinking</CardTitle>
            <CardDescription className="text-[12px]">
              Enable Claude's chain-of-thought reasoning
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={thinkingEnabled}
                aria-label="Toggle extended thinking"
                onClick={() =>
                  form.setValue("thinkingEnabled", !thinkingEnabled, { shouldDirty: true })
                }
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors cursor-pointer",
                  thinkingEnabled ? "bg-foreground" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 h-4 w-4 rounded-full transition-transform bg-background",
                    thinkingEnabled && "translate-x-4",
                  )}
                />
              </button>
              <span className="text-[13px]">{thinkingEnabled ? "On" : "Off"}</span>
            </div>

            {/* Effort */}
            <div
              className={cn(
                "space-y-2 transition-opacity",
                !thinkingEnabled && "opacity-30 pointer-events-none",
              )}
            >
              <div className="text-[12px] text-muted-foreground">Effort</div>
              <div className="inline-flex rounded-lg border border-border text-[12px] overflow-hidden">
                {thinkingEfforts.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => form.setValue("thinkingEffort", e, { shouldDirty: true })}
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
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={update.isPending}
            className="inline-flex h-8 items-center gap-2 rounded-md bg-foreground px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
          {isDirty && (
            <button
              type="button"
              onClick={() => form.reset()}
              className="text-[12px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Discard
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
