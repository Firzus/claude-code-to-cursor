import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { apiFetch } from "~/lib/api-client";
import { cn } from "~/lib/utils";
import type { LoginResponse } from "~/schemas/api-responses";
import { type LoginFormValues, loginFormSchema } from "~/schemas/login";

interface OAuthFlowProps {
  onSuccess?: () => void;
  compact?: boolean;
}

export function OAuthFlow({ onSuccess, compact }: OAuthFlowProps) {
  const [loginData, setLoginData] = useState<LoginResponse | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { code: "" },
  });

  async function initLogin() {
    setLoadingAuth(true);
    setResult(null);
    try {
      setLoginData(await apiFetch<LoginResponse>("/auth/login"));
    } catch (err) {
      setResult({ success: false, message: `Failed to initialize: ${err}` });
    } finally {
      setLoadingAuth(false);
    }
  }

  async function onSubmit(values: LoginFormValues) {
    if (!loginData) return;
    setResult(null);
    try {
      const res = await apiFetch<{
        success: boolean;
        message: string;
        expiresIn?: number;
      }>("/auth/callback", {
        method: "POST",
        body: JSON.stringify({ code: values.code, state: loginData.state }),
      });
      setResult(res);
      if (res.success) {
        form.reset();
        setLoginData(null);
        onSuccess?.();
      }
    } catch (err) {
      setResult({ success: false, message: `Failed: ${err}` });
    }
  }

  return (
    <div className="space-y-4">
      {result && (
        <Alert variant={result.success ? "success" : "error"} description={result.message} />
      )}

      <div
        data-surface="terminal"
        className={cn("rounded-md divide-y divide-border/60 font-mono", compact && "text-[13px]")}
      >
        {/* Step 1 */}
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <StepNumber n={1} />
            <span className="text-[13px] font-medium">Start authorization</span>
          </div>
          <div className="pl-7">
            {!loginData ? (
              <Button
                type="button"
                variant="default"
                size="default"
                onClick={initLogin}
                disabled={loadingAuth}
                isLoading={loadingAuth}
                loadingText="initialising"
              >
                initialize
              </Button>
            ) : (
              <Button
                asChild
                variant="default"
                size="default"
                trailing={<ExternalLink className="h-3 w-3" aria-hidden="true" />}
              >
                <a
                  href={loginData.authURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open Anthropic authorization page (opens in new tab)"
                >
                  open anthropic
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* Step 2 */}
        <div className="p-4">
          <div className="flex items-center gap-2">
            <StepNumber n={2} />
            <span className="text-[13px] font-medium">Approve and copy the code</span>
          </div>
          <p className="mt-1.5 pl-7 text-[12px] text-muted-foreground leading-relaxed">
            After approving on Anthropic, copy the authorization code displayed.
          </p>
        </div>

        {/* Step 3 */}
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <StepNumber n={3} />
            <span className="text-[13px] font-medium">Paste the code</span>
          </div>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-2 pl-7">
            <label htmlFor="auth-code" className="sr-only">
              Authorization code
            </label>
            <Input
              id="auth-code"
              placeholder="paste code..."
              disabled={!loginData}
              aria-label="Authorization code"
              aria-invalid={Boolean(form.formState.errors.code)}
              className="flex-1"
              {...form.register("code")}
            />
            <Button
              type="submit"
              variant="default"
              size="default"
              disabled={!loginData || form.formState.isSubmitting}
              isLoading={form.formState.isSubmitting}
              loadingText="submitting"
            >
              submit
            </Button>
          </form>
          {form.formState.errors.code && (
            <p className="pl-7 font-mono text-[11px] text-destructive flex items-start gap-1.5">
              <span aria-hidden="true">↳</span>
              <span>{form.formState.errors.code.message}</span>
            </p>
          )}
        </div>
      </div>

      {!compact && (
        <p className="text-[12px] text-muted-foreground">Codes expire after ~10 minutes.</p>
      )}
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-5 w-5 items-center justify-center rounded-sm border border-border/70 bg-background/60 text-[11px] font-mono tabular text-muted-foreground"
    >
      {n}
    </span>
  );
}
