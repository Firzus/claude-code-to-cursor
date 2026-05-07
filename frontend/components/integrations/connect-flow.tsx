"use client";

import { CheckCircle2, ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { startOAuthAction, submitOAuthCodeAction } from "~/lib/server-actions";

interface FormValues {
  code: string;
}

interface ConnectFlowProps {
  initiallyConnected: boolean;
  expiresAt?: number | null;
}

export function ConnectFlow({ initiallyConnected, expiresAt }: ConnectFlowProps) {
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [connected, setConnected] = useState(initiallyConnected);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({ defaultValues: { code: "" } });

  async function startOAuth() {
    setError(null);
    setStarting(true);
    const result = await startOAuthAction();
    setStarting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAuthUrl(result.data.authURL);
    setState(result.data.state);
    window.open(result.data.authURL, "_blank", "noopener,noreferrer");
  }

  async function onSubmit(values: FormValues) {
    if (!state) {
      setError("Start the OAuth flow first.");
      return;
    }
    setError(null);
    const result = await submitOAuthCodeAction({
      code: values.code.trim(),
      state,
    });
    if (!result.ok) {
      setError(result.error);
      toast.error("OAuth callback failed", { description: result.error });
      return;
    }
    setConnected(true);
    toast.success("Connected to Claude Code", {
      description: result.data.expiresIn
        ? `Token valid for ${Math.round(result.data.expiresIn / 3600)}h.`
        : undefined,
    });
    form.reset();
  }

  if (connected) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-success">
          <CheckCircle2 className="size-4" />
          <span className="text-sm font-medium">Connected via Claude Code OAuth</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {expiresAt
            ? `Token refreshes automatically. Current credential expires ${new Date(expiresAt).toLocaleString()}.`
            : "Token refreshes automatically when needed."}
        </p>
        <Button variant="outline" size="sm" className="w-fit" onClick={() => setConnected(false)}>
          Re-authorize
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Button type="button" onClick={startOAuth} disabled={starting} className="w-fit">
        {starting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <KeyRound className="size-4" aria-hidden="true" />
        )}
        {authUrl ? "Restart authorization" : "Authorize with Claude Code"}
      </Button>

      {authUrl ? (
        <Alert>
          <ExternalLink className="size-4" />
          <AlertTitle>Approve, then paste the code below</AlertTitle>
          <AlertDescription>
            We opened Anthropic in a new tab. After approval, copy the code Anthropic shows you and
            paste it here.
          </AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
        <Label htmlFor="oauth-code" className="text-sm font-medium">
          Authorization code
        </Label>
        <Input
          id="oauth-code"
          placeholder="paste the code returned by anthropic"
          disabled={!authUrl || form.formState.isSubmitting}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          {...form.register("code", { required: true })}
        />
        <Button
          type="submit"
          variant="default"
          disabled={!authUrl || form.formState.isSubmitting}
          className="w-fit"
        >
          {form.formState.isSubmitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          Exchange code
        </Button>
      </form>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>OAuth failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
