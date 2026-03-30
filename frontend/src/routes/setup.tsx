import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ExternalLink,
  Check,
  Loader2,
  Copy,
  ArrowRight,
  ArrowLeft,
  Zap,
  Shield,
  BarChart3,
  Terminal,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { apiFetch } from "~/lib/api-client";
import { loginFormSchema, type LoginFormValues } from "~/schemas/login";
import type { LoginResponse, AnalyticsResponse } from "~/schemas/api-responses";
import { useHealth } from "~/hooks/use-health";
import { useOnboardingComplete } from "~/hooks/use-onboarding";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/setup")({
  component: SetupPage,
});

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "auth", label: "Authenticate" },
  { id: "configure", label: "Configure" },
  { id: "verify", label: "Verify" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function getProxyBase() {
  if (typeof window === "undefined") return "http://localhost:8082";
  return `${window.location.protocol}//${window.location.hostname}:${window.__CCPROXY_API_PORT__ || 8082}`;
}

function SetupPage() {
  const [currentStep, setCurrentStep] = useState<StepId>("welcome");
  const { markComplete } = useOnboardingComplete();
  const navigate = useNavigate();

  const stepIndex = STEPS.findIndex((s) => s.id === currentStep);

  const next = useCallback(() => {
    const i = STEPS.findIndex((s) => s.id === currentStep);
    if (i < STEPS.length - 1) setCurrentStep(STEPS[i + 1].id);
  }, [currentStep]);

  const prev = useCallback(() => {
    const i = STEPS.findIndex((s) => s.id === currentStep);
    if (i > 0) setCurrentStep(STEPS[i - 1].id);
  }, [currentStep]);

  const finish = useCallback(() => {
    markComplete();
    navigate({ to: "/analytics" });
  }, [markComplete, navigate]);

  return (
    <div className="mx-auto max-w-2xl pt-4 animate-fade-in">
      <StepIndicator steps={STEPS} currentIndex={stepIndex} />

      <div className="mt-8">
        {currentStep === "welcome" && <WelcomeStep onNext={next} />}
        {currentStep === "auth" && <AuthStep onNext={next} onPrev={prev} />}
        {currentStep === "configure" && (
          <ConfigureStep onNext={next} onPrev={prev} />
        )}
        {currentStep === "verify" && (
          <VerifyStep onFinish={finish} onPrev={prev} />
        )}
      </div>
    </div>
  );
}

/* ─── Step indicator ─── */

function StepIndicator({
  steps,
  currentIndex,
}: {
  steps: readonly { id: string; label: string }[];
  currentIndex: number;
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={step.id} className="flex items-center gap-1">
            {i > 0 && (
              <div
                className={cn(
                  "h-px w-8 transition-colors duration-500",
                  done ? "bg-accent" : "bg-border",
                )}
              />
            )}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-mono transition-all duration-300",
                  done &&
                  "bg-accent text-background",
                  active &&
                  "border-2 border-accent text-accent shadow-[0_0_12px_-2px_var(--color-accent)]",
                  !done && !active && "border border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span
                className={cn(
                  "hidden text-[12px] sm:inline transition-colors",
                  active ? "text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Step 1: Welcome ─── */

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-8 animate-slide-up">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/5 px-4 py-1.5 text-[12px] font-medium text-accent">
          <Zap className="h-3 w-3" />
          First-time setup
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to ccproxy
        </h1>
        <p className="text-[14px] text-muted-foreground leading-relaxed max-w-md mx-auto">
          Route API requests through Claude Code OAuth.
          Use Claude in Cursor and other tools — no API key needed.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <FeatureCard
          icon={Shield}
          title="OAuth auth"
          description="Authenticate once via Anthropic, tokens auto-refresh"
        />
        <FeatureCard
          icon={Terminal}
          title="Any client"
          description="OpenAI and Anthropic format endpoints, works everywhere"
        />
        <FeatureCard
          icon={BarChart3}
          title="Analytics"
          description="Track requests, tokens, and cache performance"
        />
      </div>

      <div className="flex justify-center">
        <button
          onClick={onNext}
          className="group inline-flex h-10 items-center gap-2.5 rounded-lg bg-accent px-6 text-[13px] font-medium text-background transition-all hover:brightness-110 cursor-pointer"
        >
          Get started
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Shield;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-2.5 transition-colors hover:border-border hover:bg-card/70">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 text-accent">
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-[13px] font-medium">{title}</div>
      <div className="text-[12px] text-muted-foreground leading-relaxed">
        {description}
      </div>
    </div>
  );
}

/* ─── Step 2: Auth ─── */

function AuthStep({
  onNext,
  onPrev,
}: {
  onNext: () => void;
  onPrev: () => void;
}) {
  const [loginData, setLoginData] = useState<LoginResponse | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const health = useHealth();
  const isAuthenticated = health.data?.claudeCode.authenticated === true;

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { code: "" },
  });

  useEffect(() => {
    if (isAuthenticated) {
      setResult({ success: true, message: "Already authenticated!" });
    }
  }, [isAuthenticated]);

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
      }
    } catch (err) {
      setResult({ success: false, message: `Failed: ${err}` });
    }
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Authenticate with Anthropic
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Connect to Claude Code via OAuth. This is a one-time setup.
        </p>
      </div>

      {result && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] animate-slide-up",
            result.success
              ? "border-success/30 bg-success/5 text-success"
              : "border-destructive/30 bg-destructive/5 text-destructive",
          )}
        >
          {result.success ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <Circle className="h-4 w-4 shrink-0" />
          )}
          {result.message}
        </div>
      )}

      {!isAuthenticated && (
        <div className="rounded-lg border border-border divide-y divide-border">
          {/* Step 1 */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-[11px] font-mono text-accent">
                1
              </span>
              <span className="text-[13px] font-medium">
                Start authorization
              </span>
            </div>
            {!loginData ? (
              <button
                onClick={initLogin}
                disabled={loadingAuth}
                className="ml-8 inline-flex h-8 items-center gap-2 rounded-md bg-foreground px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {loadingAuth && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Initialize
              </button>
            ) : (
              <a
                href={loginData.authURL}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-8 inline-flex h-8 items-center gap-2 rounded-md bg-foreground px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
              >
                Open Anthropic <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Step 2 */}
          <div className="p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-[11px] font-mono text-muted-foreground">
                2
              </span>
              <span className="text-[13px] font-medium">
                Approve and copy the code
              </span>
            </div>
            <p className="mt-1.5 ml-8 text-[12px] text-muted-foreground leading-relaxed">
              After approving on Anthropic, copy the authorization code displayed.
            </p>
          </div>

          {/* Step 3 */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-[11px] font-mono text-muted-foreground">
                3
              </span>
              <span className="text-[13px] font-medium">Paste the code</span>
            </div>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex gap-2 ml-8"
            >
              <input
                placeholder="Paste code..."
                disabled={!loginData}
                className="h-8 flex-1 rounded-md border border-border bg-background px-3 font-mono text-[13px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-40 transition-all"
                {...form.register("code")}
              />
              <button
                type="submit"
                disabled={!loginData || form.formState.isSubmitting}
                className="inline-flex h-8 items-center gap-2 rounded-md bg-foreground px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {form.formState.isSubmitting && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Submit
              </button>
            </form>
            {form.formState.errors.code && (
              <p className="ml-8 text-[12px] text-destructive">
                {form.formState.errors.code.message}
              </p>
            )}
          </div>
        </div>
      )}

      <NavButtons onPrev={onPrev} onNext={onNext} nextDisabled={false} />
    </div>
  );
}

/* ─── Step 3: Configure ─── */

function ConfigureStep({
  onNext,
  onPrev,
}: {
  onNext: () => void;
  onPrev: () => void;
}) {
  const base = getProxyBase();

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Configure your client
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Point Cursor (or any compatible client) to ccproxy.
        </p>
      </div>

      <div className="space-y-3">
        <ConfigField label="Base URL" value={`${base}/v1`} mono />
        <ConfigField label="API Key" value="sk-ccproxy" sub="Any non-empty string" mono />
        <ConfigField
          label="Model"
          value="claude-sonnet-4-20250514"
          sub="Or any Claude model name"
          mono
        />
      </div>

      <div className="rounded-lg border border-border bg-card/30 p-4 space-y-3">
        <div className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
          Available endpoints
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="text-[12px] text-muted-foreground">
              OpenAI format
            </div>
            <code className="block rounded border border-border bg-background px-2.5 py-1.5 font-mono text-[12px] text-accent">
              POST /v1/chat/completions
            </code>
          </div>
          <div className="space-y-1">
            <div className="text-[12px] text-muted-foreground">
              Anthropic format
            </div>
            <code className="block rounded border border-border bg-background px-2.5 py-1.5 font-mono text-[12px] text-accent">
              POST /v1/messages
            </code>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/30 p-4 space-y-2">
        <div className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
          Test with curl
        </div>
        <CopyBlock
          value={`curl ${base}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-ccproxy" \\
  -d '{"model":"claude-sonnet-4-20250514","messages":[{"role":"user","content":"Hello!"}]}'`}
        />
      </div>

      <NavButtons onPrev={onPrev} onNext={onNext} />
    </div>
  );
}

function ConfigField({
  label,
  value,
  sub,
  mono,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:border-border/80">
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="text-[12px] text-muted-foreground">{label}</div>
        <div
          className={cn(
            "text-[13px] truncate",
            mono && "font-mono",
          )}
        >
          {value}
        </div>
        {sub && (
          <div className="text-[11px] text-muted-foreground">{sub}</div>
        )}
      </div>
      <button
        onClick={copy}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-all hover:text-foreground hover:border-foreground/20 cursor-pointer"
        title="Copy"
      >
        {copied ? (
          <Check className="h-3 w-3 text-success" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

function CopyBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded border border-border bg-background px-3 py-2.5 font-mono text-[11px] text-muted-foreground leading-relaxed">
        {value}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded border border-border bg-card text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:text-foreground cursor-pointer"
        title="Copy"
      >
        {copied ? (
          <Check className="h-3 w-3 text-success" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

/* ─── Step 4: Verify ─── */

function VerifyStep({
  onFinish,
  onPrev,
}: {
  onFinish: () => void;
  onPrev: () => void;
}) {
  const health = useHealth();
  const [detected, setDetected] = useState(false);
  const [polling, setPolling] = useState(true);

  const isAuthenticated = health.data?.claudeCode.authenticated === true;

  useEffect(() => {
    if (!polling) return;
    const id = setInterval(async () => {
      try {
        const data = await apiFetch<AnalyticsResponse>(
          "/analytics?period=hour",
        );
        if (data.totalRequests > 0) {
          setDetected(true);
          setPolling(false);
        }
      } catch {
        // ignore
      }
    }, 3000);
    return () => clearInterval(id);
  }, [polling]);

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Verify your setup
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Send a request from your client to confirm everything works.
        </p>
      </div>

      <div className="space-y-3">
        <StatusRow
          ok={isAuthenticated}
          label="OAuth authentication"
          sub={
            isAuthenticated
              ? "Connected to Claude Code"
              : "Not yet authenticated"
          }
        />
        <StatusRow
          ok={detected}
          loading={!detected && polling}
          label="First request"
          sub={
            detected
              ? "Request received — you're all set!"
              : "Waiting for a request from your client..."
          }
        />
      </div>

      {detected && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-5 text-center space-y-3 animate-slide-up">
          <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
          <div className="text-[15px] font-semibold">Setup complete</div>
          <p className="text-[13px] text-muted-foreground">
            ccproxy is working. Your requests will appear in the Analytics
            dashboard.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={onPrev}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-4 text-[13px] text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/20 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <button
          onClick={onFinish}
          className="group inline-flex h-10 items-center gap-2.5 rounded-lg bg-accent px-6 text-[13px] font-medium text-background transition-all hover:brightness-110 cursor-pointer"
        >
          {detected ? "Go to dashboard" : "Skip and finish"}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}

function StatusRow({
  ok,
  loading,
  label,
  sub,
}: {
  ok: boolean;
  loading?: boolean;
  label: string;
  sub: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-4 transition-all",
        ok
          ? "border-success/30 bg-success/5"
          : "border-border bg-card/30",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          ok
            ? "bg-success/15 text-success"
            : "bg-muted text-muted-foreground",
        )}
      >
        {ok ? (
          <Check className="h-4 w-4" />
        ) : loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{label}</div>
        <div className="text-[12px] text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}

/* ─── Navigation buttons ─── */

function NavButtons({
  onPrev,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
}: {
  onPrev?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      {onPrev ? (
        <button
          onClick={onPrev}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-4 text-[13px] text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/20 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
      ) : (
        <div />
      )}
      {onNext && (
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className="group inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-5 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {nextLabel}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}
