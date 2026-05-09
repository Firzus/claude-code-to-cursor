import { headers } from "next/headers";
import { ConnectFlow } from "~/components/integrations/connect-flow";
import { OAuthStatus } from "~/components/integrations/oauth-status";
import { SnippetCard } from "~/components/integrations/snippet-card";
import { buildSnippets } from "~/components/integrations/snippets";
import { TunnelBanner } from "~/components/integrations/tunnel-banner";
import { PageHeader } from "~/components/layout/page-header";
import { Reveal } from "~/components/motion/reveal";
import { getHealth } from "~/lib/api";
import { stripProtocol } from "~/lib/format";
import { getForwardedFor } from "~/lib/server/forwarded-for";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const incoming = await headers();
  const ip = getForwardedFor(incoming);
  const proto = incoming.get("x-forwarded-proto") ?? "http";
  const host = incoming.get("host") ?? "localhost:3111";
  const proxyBase = `${proto}://${host}`;

  const health = await getHealth(ip).catch(() => undefined);
  const tunnelUrl = health?.tunnelUrl ?? null;
  const snippets = buildSnippets(tunnelUrl ?? proxyBase);

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Integrations"
        title="Wire any client to your proxy."
        description="OpenAI- and Anthropic-compatible. Drop these snippets in once — your editor talks to Claude through the credentials you already pay for."
      />

      <Reveal delay={0.05} className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border bg-card p-6 md:p-8">
          <span className="eyebrow">Step 1 — Authorize</span>
          <h2 className="font-display mt-4 text-3xl leading-tight tracking-tight">
            Connect with Claude Code
          </h2>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
            Click below to start the OAuth handshake with Anthropic. We never see or store your
            password — only a refreshable token, kept on disk in{" "}
            <code className="font-mono text-foreground">auth.json</code>.
          </p>
          <div className="mt-6">
            <ConnectFlow
              initiallyConnected={health?.claudeCode.authenticated ?? false}
              expiresAt={health?.claudeCode.expiresAt ?? null}
            />
          </div>
        </div>
        <div className="space-y-4">
          <OAuthStatus initial={health} />
          <TunnelBanner tunnelUrl={tunnelUrl} />
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="space-y-6">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-baseline">
            <div className="space-y-2">
              <span className="eyebrow">Step 2 — Point your client</span>
              <h2 className="font-display text-3xl leading-tight tracking-tight">
                Snippets, ready to copy
              </h2>
            </div>
            <span className="text-xs text-muted-foreground">
              Endpoint:{" "}
              <span className="font-mono text-foreground">
                {stripProtocol(tunnelUrl ?? proxyBase)}
              </span>
            </span>
          </div>
          <div className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
            <SnippetCard
              title="Cursor"
              description="Add a custom OpenAI provider in Cursor's model settings."
              language="text"
              snippet={snippets.cursor}
              pillLabel="GUI"
            />
            <SnippetCard
              title="VS Code · Continue"
              description="Drop into your workspace settings.json."
              language="json"
              snippet={snippets.vscode}
              pillLabel="JSON"
            />
            <SnippetCard
              title="CLI tools"
              description="aider, llm, and friends — set the OpenAI base URL."
              language="bash"
              snippet={snippets.cli}
              pillLabel="Shell"
            />
            <SnippetCard
              title="OpenAI SDK"
              description="Stream completions from the official OpenAI client."
              language="typescript"
              snippet={snippets.openai}
              pillLabel="TS"
            />
          </div>
        </div>
      </Reveal>
    </div>
  );
}
