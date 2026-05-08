"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Brain, Loader2, Sparkles } from "lucide-react";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
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
    <section aria-label="Preferences" className="rounded-xl border bg-card">
      <form onSubmit={form.handleSubmit(onSubmit)} className="divide-y divide-border">
        {/* Model */}
        <Section
          eyebrow="Model"
          title="Pick a Claude"
          hint="Defaults to Sonnet 4.6 — the best balance of quality and speed."
        >
          <div className="space-y-3">
            <Label htmlFor="selectedModel" className="sr-only">
              Default model
            </Label>
            <Select
              value={form.watch("selectedModel")}
              onValueChange={(v) =>
                form.setValue("selectedModel", v as ModelSettings["selectedModel"], {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger id="selectedModel" className="h-11 w-full max-w-md">
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
        </Section>

        {/* Thinking */}
        <Section
          eyebrow="Reasoning"
          title="Extended thinking"
          hint="When enabled, the model spends more tokens reasoning before answering. Higher effort = more tokens, deeper plans."
        >
          <div className="space-y-5">
            <div className="grid gap-2">
              <span className="text-sm font-medium">Mode</span>
              <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                ].map(({ v, label, icon: Icon, hint }) => {
                  const active = thinkingEnabled === v;
                  return (
                    <button
                      type="button"
                      key={String(v)}
                      onClick={() => form.setValue("thinkingEnabled", v, { shouldDirty: true })}
                      aria-pressed={active}
                      className={cn(
                        "group flex items-start gap-3 rounded-lg border p-4 text-left outline-none",
                        "transition-[background-color,border-color] duration-150 ease-out",
                        "focus-visible:ring-2 focus-visible:ring-ring/60",
                        active
                          ? "border-primary/40 bg-primary/[0.04]"
                          : "border-border hover-only:hover:border-foreground/20 hover-only:hover:bg-accent/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
                          active
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground",
                        )}
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <span className="space-y-1">
                        <span className="block text-sm font-medium">{label}</span>
                        <span className="block text-xs leading-relaxed text-muted-foreground">
                          {hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="thinkingEffort" className="text-sm font-medium">
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
                <SelectTrigger id="thinkingEffort" className="h-10 w-full max-w-xs">
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
        </Section>

        {/* Subscription plan */}
        <Section
          eyebrow="Subscription"
          title="Plan tier"
          hint="Used to compute estimated quotas when Anthropic doesn't return live limits."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {supportedPlans.map((plan) => {
              const active = form.watch("subscriptionPlan") === plan;
              return (
                <button
                  type="button"
                  key={plan}
                  onClick={() => form.setValue("subscriptionPlan", plan, { shouldDirty: true })}
                  aria-pressed={active}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border p-4 text-left outline-none",
                    "transition-[background-color,border-color,transform] duration-150 ease-out",
                    "focus-visible:ring-2 focus-visible:ring-ring/60",
                    active
                      ? "border-primary/40 bg-primary/[0.04]"
                      : "border-border hover-only:hover:border-foreground/20 hover-only:hover:bg-accent/40 hover-only:hover:-translate-y-px",
                  )}
                >
                  <span className="font-display text-lg leading-tight tracking-tight">
                    {planLabels[plan]}
                  </span>
                  <span className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground tabular">
                    {planPrices[plan]}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        <footer className="flex flex-col items-stretch justify-between gap-3 px-6 py-5 sm:flex-row sm:items-center md:px-10">
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
    </section>
  );
}

function Section({
  eyebrow,
  title,
  hint,
  children,
}: {
  eyebrow: string;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 px-6 py-8 md:grid-cols-[1fr_2fr] md:gap-10 md:px-10 md:py-10">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h3 className="font-display mt-3 text-2xl leading-tight tracking-tight">{title}</h3>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  );
}
