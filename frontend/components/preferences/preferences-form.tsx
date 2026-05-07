"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Brain, Loader2, Sparkles } from "lucide-react";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { cn } from "~/lib/cn";
import {
  type ModelSettings,
  modelLabels,
  modelSettingsSchema,
  planLabels,
  planPrices,
  supportedModels,
  supportedPlans,
  thinkingEfforts,
} from "~/lib/schemas";
import { savePreferencesAction } from "~/lib/server-actions";

export function PreferencesForm({ defaultValues }: { defaultValues: ModelSettings }) {
  const form = useForm<ModelSettings>({
    resolver: zodResolver(modelSettingsSchema),
    defaultValues,
  });
  const [pending, startTransition] = useTransition();

  const thinkingEnabled = form.watch("thinkingEnabled");

  function onSubmit(values: ModelSettings) {
    startTransition(async () => {
      const result = await savePreferencesAction(values);
      if (result.ok) {
        toast.success("Preferences saved");
        form.reset(result.data);
      } else {
        toast.error("Couldn't save", { description: result.error });
      }
    });
  }

  return (
    <Card className="border-none shadow-(--shadow-soft-md)">
      <CardContent className="px-6 md:px-10">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">
          {/* Model */}
          <section className="grid gap-6 md:grid-cols-[1fr_2fr]">
            <div>
              <span className="eyebrow">Model</span>
              <h3 className="font-display mt-2 text-2xl tracking-tight">Pick a Claude</h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Defaults to Sonnet 4.6 — the best balance of quality and speed.
              </p>
            </div>
            <div className="space-y-3">
              <Label htmlFor="selectedModel">Default model</Label>
              <Select
                value={form.watch("selectedModel")}
                onValueChange={(v) =>
                  form.setValue("selectedModel", v as ModelSettings["selectedModel"], {
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger id="selectedModel" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedModels.map((m) => (
                    <SelectItem key={m} value={m}>
                      {modelLabels[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <Separator />

          {/* Thinking */}
          <section className="grid gap-6 md:grid-cols-[1fr_2fr]">
            <div>
              <span className="eyebrow">Reasoning</span>
              <h3 className="font-display mt-2 text-2xl tracking-tight">Extended thinking</h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                When enabled, the model spends more tokens reasoning before answering. Higher effort
                = more tokens, deeper plans.
              </p>
            </div>
            <div className="space-y-5">
              <div className="grid gap-2">
                <Label className="text-sm">Mode</Label>
                <div role="radiogroup" className="grid grid-cols-2 gap-2">
                  {[
                    {
                      v: false,
                      label: "Disabled",
                      icon: Sparkles,
                      hint: "Direct answers, no extra thinking tokens.",
                    },
                    {
                      v: true,
                      label: "Enabled",
                      icon: Brain,
                      hint: "Reasons internally before responding.",
                    },
                  ].map(({ v, label, icon: Icon, hint }) => (
                    <button
                      type="button"
                      key={String(v)}
                      onClick={() => form.setValue("thinkingEnabled", v, { shouldDirty: true })}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                        thinkingEnabled === v
                          ? "border-primary/40 bg-primary/5"
                          : "border-border hover:bg-muted/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                          thinkingEnabled === v
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="space-y-1">
                        <span className="block text-sm font-medium">{label}</span>
                        <span className="block text-xs text-muted-foreground">{hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="thinkingEffort" className="text-sm">
                  Thinking effort
                </Label>
                <Select
                  value={form.watch("thinkingEffort")}
                  disabled={!thinkingEnabled}
                  onValueChange={(v) =>
                    form.setValue("thinkingEffort", v as ModelSettings["thinkingEffort"], {
                      shouldDirty: true,
                    })
                  }
                >
                  <SelectTrigger id="thinkingEffort" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {thinkingEfforts.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator />

          {/* Subscription plan */}
          <section className="grid gap-6 md:grid-cols-[1fr_2fr]">
            <div>
              <span className="eyebrow">Subscription</span>
              <h3 className="font-display mt-2 text-2xl tracking-tight">Plan tier</h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Used to compute estimated quotas when Anthropic doesn't return live limits.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {supportedPlans.map((plan) => {
                const active = form.watch("subscriptionPlan") === plan;
                return (
                  <button
                    type="button"
                    key={plan}
                    onClick={() => form.setValue("subscriptionPlan", plan, { shouldDirty: true })}
                    className={cn(
                      "flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors",
                      active ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/40",
                    )}
                  >
                    <span className="font-display text-lg tracking-tight">{planLabels[plan]}</span>
                    <span className="font-mono text-xs text-muted-foreground tabular">
                      {planPrices[plan]}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <Separator />

          <footer className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {form.formState.isDirty
                ? "You have unsaved changes."
                : "All preferences are in sync with the API."}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => form.reset(defaultValues)}
                disabled={!form.formState.isDirty || pending}
              >
                Discard
              </Button>
              <Button type="submit" disabled={!form.formState.isDirty || pending}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Save preferences
              </Button>
            </div>
          </footer>
        </form>
      </CardContent>
    </Card>
  );
}
