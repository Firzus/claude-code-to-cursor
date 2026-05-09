import { Suspense } from "react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConnectFlow } from "~/components/integrations/connect-flow";
import { SnippetCard } from "~/components/integrations/snippet-card";
import { buildSnippets } from "~/components/integrations/snippets";
import { AuroraShader } from "~/components/layout/aurora-shader";
import { Reveal } from "~/components/motion/reveal";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { WelcomeHero } from "~/components/welcome/hero";
import { StepCard } from "~/components/welcome/step-card";
import { getHealth, getSettings } from "~/lib/api";
import { stripProtocol } from "~/lib/format";
import { type ModelSettings, modelLabels } from "~/lib/schemas";
import { getForwardedFor } from "~/lib/server/forwarded-for";

export default function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ force?: string }>;
}) {
  return (
    <div className="relative space-y-16">
      <AuroraShader className="-top-24 h-[42rem]" intensity={0.7} />
      <WelcomeHero
        eyebrow="Welcome"
        title="Route Claude through your own credentials, in three quiet steps."
        description="Claude Code to Cursor is a self-hosted proxy. Connect once, choose your model, and any OpenAI- or Anthropic-compatible client points to your endpoint."
      />

      <Suspense fallback={<StepGridSkeleton />}>
        <Steps searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-44 w-full rounded-xl" />}>
        <QuickConnect />
      </Suspense>
    </div>
  );
}

async function Steps({
  searchParams,
}: {
  searchParams: Promise<{ force?: string }>;
}) {
  const { force } = await searchParams;
  const ip = getForwardedFor(await headers());

  const [health, settingsRes] = await Promise.all([
    getHealth(ip).catch(() => undefined),
    getSettings(ip).catch(() => undefined),
  ]);

  const authenticated = health?.claudeCode.authenticated ?? false;
  if (authenticated && force !== "1") {
    redirect("/");
  }

  const settings: ModelSettings | undefined = settingsRes?.settings;

  return (
    <Reveal delay={0.2} className="grid gap-6 md:grid-cols-3">
      <StepCard
        index={1}
        total={3}
        title="Connect with Claude Code"
        description="OAuth flow forwarded to Anthropic. Approve in the new tab, paste back the code."
        state={authenticated ? "done" : "active"}
      >
        {authenticated ? (
          <Link
            href="/integrations"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Manage credentials →
          </Link>
        ) : (
          <ConnectFlow
            initiallyConnected={false}
            expiresAt={health?.claudeCode.expiresAt ?? null}
          />
        )}
      </StepCard>

      <StepCard
        index={2}
        total={3}
        title="Pick your model"
        description="Defaults to Sonnet 4.6. Switch to Opus or Haiku from preferences whenever you like."
        state={settings ? "done" : authenticated ? "active" : "pending"}
      >
        <div className="flex flex-col gap-3">
          <p className="font-mono text-xs text-muted-foreground">
            Currently:{" "}
            <span className="text-foreground">
              {settings ? modelLabels[settings.selectedModel] : "—"}
            </span>
          </p>
          <Button asChild variant="outline" size="sm" className="w-fit">
            <Link href="/preferences">Open preferences</Link>
          </Button>
        </div>
      </StepCard>

      <StepCard
        index={3}
        total={3}
        title="Point your client here"
        description="Drop the snippet below into Cursor, VS Code, or any OpenAI-compatible client."
        state={authenticated ? "active" : "pending"}
      >
        <Button asChild size="sm" className="w-fit">
          <Link href="/integrations">See all snippets</Link>
        </Button>
      </StepCard>
    </Reveal>
  );
}

async function QuickConnect() {
  const incoming = await headers();
  const proto = incoming.get("x-forwarded-proto") ?? "http";
  const host = incoming.get("host") ?? "localhost:3111";
  const proxyBase = `${proto}://${host}`;
  const snippets = buildSnippets(proxyBase);

  return (
    <Reveal delay={0.3}>
      <div className="space-y-6">
        <div className="flex items-baseline justify-between gap-4">
          <div className="space-y-2">
            <span className="eyebrow">Quick connect</span>
            <h2 className="font-display text-3xl tracking-tight">Drop this into Cursor</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            Endpoint:{" "}
            <span className="font-mono text-foreground">{stripProtocol(proxyBase)}</span>
          </span>
        </div>
        <SnippetCard
          title="Cursor — Settings → Models"
          description="Add a custom OpenAI provider with the proxy base URL."
          language="text"
          snippet={snippets.cursor}
          pillLabel="Cursor"
        />
      </div>
    </Reveal>
  );
}

function StepGridSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}
