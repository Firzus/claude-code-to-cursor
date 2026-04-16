import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { BarChart3, CheckCircle2, Shield, Terminal } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { OAuthFlow } from "~/components/oauth-flow";
import { Panel } from "~/components/settings/panel";
import { CopyBlock } from "~/components/setup/copy-block";
import { NavButtons } from "~/components/setup/nav-buttons";
import { StatusRow } from "~/components/setup/status-row";
import { StepIndicator } from "~/components/setup/step-indicator";
import { useHealth } from "~/hooks/use-health";
import { useOnboardingComplete } from "~/hooks/use-onboarding";
import { apiFetch } from "~/lib/api-client";
import { cn } from "~/lib/utils";
import type { AnalyticsResponse } from "~/schemas/api-responses";

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "auth", label: "Authenticate" },
  { id: "configure", label: "Configure" },
  { id: "verify", label: "Verify" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

const setupSearchSchema = z.object({
  step: z.enum(["welcome", "auth", "configure", "verify"]).optional(),
});

type SetupSearch = z.infer<typeof setupSearchSchema>;

export const Route = createFileRoute("/setup")({
  validateSearch: (search): SetupSearch => setupSearchSchema.parse(search),
  component: SetupPage,
});

const STEP_STORAGE_KEY = "cctc:setup-step";

function getProxyBase() {
  if (typeof window === "undefined") return "http://localhost:8082";
  return `${window.location.protocol}//${window.location.hostname}:${window.__CCTC_API_PORT__ || 8082}`;
}

function getInitialStep(searchStep?: StepId): StepId {
  if (searchStep && STEPS.some((s) => s.id === searchStep)) return searchStep;
  if (typeof window === "undefined") return "welcome";
  const stored = sessionStorage.getItem(STEP_STORAGE_KEY);
  if (stored && STEPS.some((s) => s.id === stored)) return stored as StepId;
  return "welcome";
}

function SetupPage() {
  const search = Route.useSearch();
  const [currentStep, setCurrentStep] = useState<StepId>(() => getInitialStep(search.step));
  const { markComplete } = useOnboardingComplete();
  const navigate = useNavigate();

  const stepIndex = STEPS.findIndex((s) => s.id === currentStep);

  useEffect(() => {
    if (search.step && STEPS.some((s) => s.id === search.step)) {
      setCurrentStep(search.step);
    }
  }, [search.step]);

  useEffect(() => {
    sessionStorage.setItem(STEP_STORAGE_KEY, currentStep);
  }, [currentStep]);

  const next = useCallback(() => {
    const i = STEPS.findIndex((s) => s.id === currentStep);
    if (i < STEPS.length - 1) setCurrentStep(STEPS[i + 1].id);
  }, [currentStep]);

  const prev = useCallback(() => {
    const i = STEPS.findIndex((s) => s.id === currentStep);
    if (i > 0) setCurrentStep(STEPS[i - 1].id);
  }, [currentStep]);

  const finish = useCallback(() => {
    sessionStorage.removeItem(STEP_STORAGE_KEY);
    markComplete();
    navigate({ to: "/analytics" });
  }, [markComplete, navigate]);

  return (
    <div className="mx-auto max-w-3xl space-y-8 pt-2 animate-fade-in">
      <header className="flex flex-col gap-3 border-b border-border/60 pb-5">
        <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
          <span aria-hidden="true" className="inline-block h-px w-6 bg-border" />
          <span>setup.wizard</span>
          <span aria-hidden="true" className="text-muted-foreground/50">
            ·
          </span>
          <span className="text-muted-foreground/70 tabular">
            {String(stepIndex + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
          </span>
        </div>
        <StepIndicator steps={STEPS} currentIndex={stepIndex} />
      </header>

      <div className="mt-2">
        {currentStep === "welcome" && <WelcomeStep onNext={next} />}
        {currentStep === "auth" && <AuthStep onNext={next} onPrev={prev} />}
        {currentStep === "configure" && <ConfigureStep onNext={next} onPrev={prev} />}
        {currentStep === "verify" && <VerifyStep onFinish={finish} onPrev={prev} />}
      </div>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-10 animate-slide-up">
      <div className="space-y-5">
        <div
          className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground"
          style={{ animationDelay: "40ms" }}
        >
          <span aria-hidden="true" className="text-accent">
            ↳
          </span>
          first-time setup · v1
        </div>
        <h1
          className="font-mono font-semibold leading-[0.95] tracking-[-0.04em] text-[clamp(2rem,5vw,3.25rem)]"
          style={{ animationDelay: "80ms" }}
        >
          <span className="block text-foreground">welcome</span>
          <span className="block text-muted-foreground">
            <span aria-hidden="true" className="text-foreground">
              to_the_proxy
            </span>
            <span
              aria-hidden="true"
              className="ml-1 inline-block h-[0.62em] w-[0.32em] translate-y-[0.05em] bg-accent animate-[caret_1.1s_steps(2)_infinite]"
            />
          </span>
        </h1>
        <p className="max-w-xl text-[14px] leading-relaxed text-muted-foreground">
          Route any OpenAI- or Anthropic-compatible client through Claude Code via OAuth. Token
          refresh, cache-optimised prompts, and request analytics — without exposing a single API
          key.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <FeatureBlock
          index="01 · Auth"
          title="OAuth proxy"
          description="Authenticate once via Anthropic. Tokens auto-refresh, never leave your machine."
          icon={Shield}
          delay={120}
        />
        <FeatureBlock
          index="02 · Translate"
          title="Any client"
          description="OpenAI and Anthropic format endpoints — drop-in for Cursor, VS Code, custom tools."
          icon={Terminal}
          delay={180}
        />
        <FeatureBlock
          index="03 · Observe"
          title="Analytics built-in"
          description="Track requests, tokens, cache hits and budget — local SQLite, no leakage."
          icon={BarChart3}
          delay={240}
        />
      </div>

      <div className="flex items-center justify-between border-t border-border/60 pt-5">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          $ wizard --start
        </span>
        <NavButtons onNext={onNext} nextLabel="get_started" />
      </div>
    </div>
  );
}

function FeatureBlock({
  index,
  title,
  description,
  icon: Icon,
  delay = 0,
}: {
  index: string;
  title: string;
  description: string;
  icon: LucideIcon;
  delay?: number;
}) {
  return (
    <article
      className={cn(
        "group relative flex flex-col gap-4 rounded-lg border border-border bg-card/30 p-5",
        "transition-all duration-300 hover:-translate-y-0.5 hover:border-border/70 hover:bg-card/60",
        "animate-fade-in",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
          {index}
        </span>
        <span className="rounded-md border border-border/80 bg-background/60 p-1.5 text-muted-foreground transition-colors group-hover:border-accent/50 group-hover:text-accent">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
      <div>
        <h3 className="text-[14px] font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </article>
  );
}

function AuthStep({ onNext, onPrev }: { onNext: () => void; onPrev: () => void }) {
  const health = useHealth();
  const isAuthenticated = health.data?.claudeCode.authenticated === true;

  return (
    <div className="space-y-6 animate-slide-up">
      <Panel
        index="auth.pkce"
        title="Authenticate with Anthropic"
        hint="oauth · interactive"
        footer={
          <>
            <span>$ oauth --init</span>
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "h-1 w-1 rounded-full",
                  isAuthenticated ? "bg-success animate-pulse" : "bg-muted-foreground/40",
                )}
              />
              {isAuthenticated ? "session active" : "awaiting code"}
            </span>
          </>
        }
      >
        <p className="mb-4 text-[12.5px] text-muted-foreground leading-relaxed font-sans">
          Connect to Claude Code via OAuth. This is a one-time setup — credentials are stored
          locally and refreshed automatically.
        </p>
        {isAuthenticated ? (
          <div className="flex items-center gap-2.5 rounded-md border border-success/30 bg-success/5 px-3 py-2.5 text-[12.5px] text-success font-mono animate-slide-up">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            already authenticated · session live
          </div>
        ) : (
          <OAuthFlow compact />
        )}
      </Panel>

      <NavButtons onPrev={onPrev} onNext={onNext} nextLabel="continue" />
    </div>
  );
}

function ConfigureStep({ onNext, onPrev }: { onNext: () => void; onPrev: () => void }) {
  const health = useHealth();
  const tunnelUrl = health.data?.tunnelUrl;
  const baseUrl = tunnelUrl ? `${tunnelUrl}/v1` : `${getProxyBase()}/v1`;

  return (
    <div className="space-y-6 animate-slide-up">
      <Panel
        index="client.config"
        title="Configure your client"
        hint="cursor · vscode · openai-compat"
        footer={
          <>
            <span>$ cat ~/.cursor/config</span>
            <span className="text-muted-foreground/70">3 fields</span>
          </>
        }
      >
        <p className="mb-4 text-[12.5px] text-muted-foreground leading-relaxed font-sans">
          Point Cursor (or any compatible client) to claude-code-to-cursor. Override the OpenAI base
          URL and use any non-empty API key.
        </p>
        <div className="divide-y divide-border/50 rounded-md border border-border/60 bg-background/40">
          <ConfigField label="base_url" value={baseUrl} sub="override the OpenAI Base URL" />
          <ConfigField label="api_key" value="sk-cctc" sub="any non-empty string" />
          <ConfigField label="model" value="Claude Code" sub="add as a custom model" />
        </div>
      </Panel>

      <NavButtons onPrev={onPrev} onNext={onNext} nextLabel="continue" />
    </div>
  );
}

function ConfigField({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may fail in non-secure contexts
    }
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 font-mono">
      <span className="w-[68px] shrink-0 text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] text-foreground truncate" title={value}>
          {value}
        </div>
        {sub && <div className="text-[10.5px] text-muted-foreground/70 mt-0.5">{sub}</div>}
      </div>
      <button
        type="button"
        onClick={copy}
        className={cn(
          "inline-flex h-6 items-center gap-1.5 shrink-0 rounded border border-border/70 bg-card/40 px-2 text-[10px] uppercase tracking-[0.18em] transition-all cursor-pointer",
          copied
            ? "border-success/40 text-success"
            : "text-muted-foreground hover:text-foreground hover:border-foreground/30",
        )}
        aria-label={`Copy ${label}`}
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}

function VerifyStep({ onFinish, onPrev }: { onFinish: () => void; onPrev: () => void }) {
  const health = useHealth();
  const [detected, setDetected] = useState(false);
  const [polling, setPolling] = useState(true);
  const [baseline, setBaseline] = useState<number | null>(null);

  const isAuthenticated = health.data?.claudeCode.authenticated === true;

  useEffect(() => {
    apiFetch<AnalyticsResponse>("/analytics?period=hour")
      .then((data) => setBaseline(data.totalRequests))
      .catch(() => setBaseline(0));
  }, []);

  useEffect(() => {
    if (!polling || baseline === null) return;
    const id = setInterval(async () => {
      try {
        const data = await apiFetch<AnalyticsResponse>("/analytics?period=hour");
        if (data.totalRequests > baseline) {
          setDetected(true);
          setPolling(false);
        }
      } catch {
        // ignore
      }
    }, 3000);
    return () => clearInterval(id);
  }, [polling, baseline]);

  return (
    <div className="space-y-6 animate-slide-up">
      <Panel
        index="verify.live"
        title="Verify your setup"
        hint="polling · 3s interval"
        footer={
          <>
            <span>$ tail -f proxy</span>
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "h-1 w-1 rounded-full",
                  detected
                    ? "bg-success"
                    : polling
                      ? "bg-warning animate-pulse"
                      : "bg-muted-foreground/40",
                )}
              />
              {detected ? "detected" : polling ? "watching" : "idle"}
            </span>
          </>
        }
      >
        <p className="mb-4 text-[12.5px] text-muted-foreground leading-relaxed font-sans">
          Send a request from your client to confirm everything works.
        </p>
        <div className="divide-y divide-border/50 rounded-md border border-border/60 bg-background/40">
          <StatusRow
            ok={isAuthenticated}
            label="oauth_session"
            sub={isAuthenticated ? "connected to Claude Code" : "not yet authenticated"}
          />
          <StatusRow
            ok={detected}
            loading={!detected && polling}
            label="first_request"
            sub={
              detected
                ? "request received — you're all set"
                : "waiting for a request from your client..."
            }
          />
        </div>
      </Panel>

      {!detected && (
        <Panel
          index="hint.test"
          title="Send a test message"
          hint="paste in your Cursor chat"
          delay={120}
        >
          <CopyBlock
            value="Analyse mon projet puis présente le moi succintement."
            label="prompt · sample"
          />
        </Panel>
      )}

      {detected && (
        <Panel
          index="status.complete"
          title="Setup complete"
          hint="all green"
          delay={120}
          status="active"
          footer={
            <>
              <span>$ exit 0</span>
              <span className="text-success">success</span>
            </>
          }
        >
          <div className="flex items-start gap-3 py-2">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success mt-0.5" />
            <p className="text-[12.5px] text-foreground leading-relaxed font-sans">
              claude-code-to-cursor is working. Your requests will appear in the Analytics
              dashboard.
            </p>
          </div>
        </Panel>
      )}

      <NavButtons
        onPrev={onPrev}
        onNext={onFinish}
        nextLabel={detected ? "go_to_dashboard" : "skip_and_finish"}
      />
    </div>
  );
}
