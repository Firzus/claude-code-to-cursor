import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ExternalLink, Loader2, X } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
        <div
          role="alert"
          aria-live="polite"
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] animate-slide-up",
            result.success
              ? "border-success/30 bg-success/5 text-success"
              : "border-destructive/30 bg-destructive/5 text-destructive",
          )}
        >
          {result.success ? (
            <Check className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <X className="h-3.5 w-3.5 shrink-0" />
          )}
          {result.message}
        </div>
      )}

      <div
        className={cn(
          "rounded-lg border border-border divide-y divide-border",
          compact && "text-[13px]",
        )}
      >
        {/* Step 1 */}
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <StepNumber n={1} />
            <span className="text-[13px] font-medium">Start authorization</span>
          </div>
          <div className="pl-7">
            {!loginData ? (
              <button
                onClick={initLogin}
                disabled={loadingAuth}
                className="inline-flex h-8 items-center gap-2 rounded-md bg-foreground px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {loadingAuth && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Initialize
              </button>
            ) : (
              <a
                href={loginData.authURL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open Anthropic authorization page (opens in new tab)"
                className="inline-flex h-8 items-center gap-2 rounded-md bg-foreground px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
              >
                Open Anthropic <ExternalLink className="h-3 w-3" />
              </a>
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
            <input
              id="auth-code"
              placeholder="Paste code..."
              disabled={!loginData}
              aria-label="Authorization code"
              className="h-8 flex-1 rounded-md border border-border bg-background px-3 font-mono text-[13px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40 transition-all"
              {...form.register("code")}
            />
            <button
              type="submit"
              disabled={!loginData || form.formState.isSubmitting}
              className="inline-flex h-8 items-center gap-2 rounded-md bg-foreground px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              {form.formState.isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Submit
            </button>
          </form>
          {form.formState.errors.code && (
            <p className="pl-7 text-[12px] text-destructive">
              {form.formState.errors.code.message}
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
    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[11px] font-mono">
      {n}
    </span>
  );
}
