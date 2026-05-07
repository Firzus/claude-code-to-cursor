import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConnectFlow } from "~/components/integrations/connect-flow";
import { SnippetCard } from "~/components/integrations/snippet-card";
import { buildSnippets } from "~/components/integrations/snippets";
import { Reveal } from "~/components/motion/reveal";
import { Button } from "~/components/ui/button";
import { WelcomeHero } from "~/components/welcome/hero";
import { StepCard } from "~/components/welcome/step-card";
import { getHealth, getSettings } from "~/lib/api";
import { type ModelSettings, modelLabels } from "~/lib/schemas";

export const dynamic = "force-dynamic";

interface WelcomeSearchParams {
  force?: string;
}

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<WelcomeSearchParams>;
}) {
  const { force } = await searchParams;
  const incoming = await headers();
  const ip = incoming.get("cf-connecting-ip") ?? incoming.get("x-forwarded-for") ?? undefined;

  const [health, settingsRes] = await Promise.all([
    getHealth(ip).catch(() => undefined),
    getSettings(ip).catch(() => undefined),
  ]);

  const authenticated = health?.claudeCode.authenticated ?? false;
  if (authenticated && force !== "1") {
    redirect("/");
  }

  const proto = incoming.get("x-forwarded-proto") ?? "http";
  const host = incoming.get("host") ?? "localhost:3111";
  const proxyBase = `${proto}://${host}`;
  const snippets = buildSnippets(proxyBase);

  const settings: ModelSettings | undefined = settingsRes?.settings;

  return (
    <div className="space-y-14">
      <WelcomeHero
        eyebrow="Welcome"
        title="Route Claude through your own credentials, in three quiet steps."
        description="Claude Code to Cursor is a self-hosted proxy. Connect once, choose your model, and any OpenAI- or Anthropic-compatible client points to your endpoint."
      />

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
          <div className="flex flex-col gap-2">
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

      <Reveal delay={0.3}>
        <div className="space-y-6">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <span className="eyebrow">Quick connect</span>
              <h2 className="font-display mt-2 text-3xl tracking-tight">Drop this into Cursor</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              Endpoint:{" "}
              <span className="font-mono text-foreground">
                {proxyBase.replace(/^https?:\/\//, "")}
              </span>
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
    </div>
  );
}
