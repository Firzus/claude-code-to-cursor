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
import { Card, CardContent } from "~/components/ui/card";
import { resetAnalyticsAction, resetRateLimitAction } from "~/lib/server-actions";

export function AdvancedPanel() {
  return (
    <Card className="border-none shadow-(--shadow-soft-sm)">
      <CardContent className="px-6 md:px-10">
        <div className="space-y-2 pb-6">
          <span className="eyebrow">Advanced</span>
          <h3 className="font-display text-2xl tracking-tight">Maintenance</h3>
          <p className="max-w-prose text-sm text-muted-foreground">
            Tools for when something feels off. These actions don't affect your OAuth credentials.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ResetCard
            icon={<Gauge className="size-4" />}
            title="Reset rate-limit cache"
            description="Clear the in-memory backpressure lock — useful right after Anthropic lifts a rate limit."
            confirm="Clear the rate-limit lock?"
            confirmHelp="The next request will probe upstream and re-hydrate the cache."
            action={async () => {
              const res = await resetRateLimitAction();
              return res.ok ? "Rate-limit cache cleared" : `Failed: ${res.error}`;
            }}
          />
          <ResetCard
            icon={<Database className="size-4" />}
            title="Wipe analytics history"
            description="Permanently delete every recorded request and incident. The proxy keeps running normally."
            confirm="Delete all recorded requests?"
            confirmHelp="This can't be undone. Estimates and budget cards will reset to zero."
            action={async () => {
              const res = await resetAnalyticsAction();
              return res.ok ? `Cleared ${res.data} requests` : `Failed: ${res.error}`;
            }}
            danger
          />
        </div>
      </CardContent>
    </Card>
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
  action: () => Promise<string>;
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <article className="flex h-full flex-col gap-4 rounded-xl border bg-card/60 p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
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
                const message = await action();
                if (message.startsWith("Failed")) toast.error(message);
                else toast.success(message);
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
