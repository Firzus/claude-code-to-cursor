"use client";

import { Database, Gauge } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { resetAnalyticsAction, resetRateLimitAction } from "~/lib/server-actions";

export function AdvancedPanel() {
  return (
    <section aria-label="Advanced" className="rounded-xl border bg-card">
      <header className="space-y-2 border-b px-6 py-6 md:px-10">
        <span className="eyebrow">Advanced</span>
        <h3 className="font-display text-2xl leading-tight tracking-tight">Maintenance</h3>
        <p className="max-w-prose text-sm text-muted-foreground">
          Tools for when something feels off. These actions don't affect your OAuth credentials.
        </p>
      </header>

      <div className="grid gap-px border-t bg-border md:grid-cols-2">
        <ResetCard
          icon={<Gauge className="size-3.5" />}
          title="Reset rate-limit cache"
          description="Clear the in-memory backpressure lock — useful right after Anthropic lifts a rate limit."
          confirm="Clear the rate-limit lock?"
          confirmHelp="The next request will probe upstream and re-hydrate the cache."
          action={async () => {
            const res = await resetRateLimitAction();
            return res.ok
              ? { ok: true, message: "Rate-limit cache cleared" }
              : { ok: false, message: res.error };
          }}
        />
        <ResetCard
          icon={<Database className="size-3.5" />}
          title="Wipe analytics history"
          description="Permanently delete every recorded request and incident. The proxy keeps running normally."
          confirm="Delete all recorded requests?"
          confirmHelp="This can't be undone. Estimates and budget cards will reset to zero."
          action={async () => {
            const res = await resetAnalyticsAction();
            return res.ok
              ? { ok: true, message: `Cleared ${res.data} requests` }
              : { ok: false, message: res.error };
          }}
          danger
        />
      </div>
    </section>
  );
}

function ResetCard({
  icon,
  title,
  description,
  confirm,
  confirmHelp,
  action,
  danger = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  confirm: string;
  confirmHelp: string;
  action: () => Promise<{ ok: boolean; message: string }>;
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <article className="flex h-full flex-col gap-4 bg-card p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-7 items-center justify-center rounded-full border bg-background text-muted-foreground">
            {icon}
          </span>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">{title}</h4>
            <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
        <AlertDialogTrigger asChild>
          <Button variant={danger ? "destructive" : "outline"} size="sm" className="mt-auto w-fit">
            {danger ? "Wipe history" : "Clear cache"}
          </Button>
        </AlertDialogTrigger>
      </article>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm}</AlertDialogTitle>
          <AlertDialogDescription>{confirmHelp}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              startTransition(async () => {
                const result = await action();
                if (result.ok) toast.success(result.message);
                else toast.error(`Failed: ${result.message}`);
                setOpen(false);
              })
            }
            disabled={pending}
          >
            {pending ? "Working…" : "Yes, do it"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
