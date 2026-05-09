import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { ConnectFlow } from "~/components/integrations/connect-flow";
import { OAuthStatus } from "~/components/integrations/oauth-status";
import { SnippetCard } from "~/components/integrations/snippet-card";
import { buildSnippets } from "~/components/integrations/snippets";
import { TunnelBanner } from "~/components/integrations/tunnel-banner";
import { PageHeader } from "~/components/layout/page-header";
import { Reveal } from "~/components/motion/reveal";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { getHealth } from "~/lib/api";
import { stripProtocol } from "~/lib/format";
import { getForwardedFor } from "~/lib/server/forwarded-for";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const incoming = await headers();
  const ip = getForwardedFor(incoming);
  const proto = incoming.get("x-forwarded-proto") ?? "http";
  const host = incoming.get("host") ?? "localhost:3111";
  const proxyBase = `${proto}://${host}`;

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Integrations"
        title="Wire Cursor to your proxy."
        description="cctc is built for one client: Cursor. Authorize once with Claude Code, drop the snippet into Cursor's settings, and your editor talks to Claude through the credentials you already pay for."
      />

      <Suspense fallback={<IntegrationsBodySkeleton />}>
        <IntegrationsBody ip={ip} proxyBase={proxyBase} />
      </Suspense>
    </div>
  );
}

async function IntegrationsBody({ ip, proxyBase }: { ip?: string; proxyBase: string }) {
  const health = await getHealth(ip).catch(() => undefined);
  const tunnelUrl = health?.tunnelUrl ?? null;
  const endpoint = tunnelUrl ?? proxyBase;
  const snippets = buildSnippets(endpoint);
  const baseUrl = `${endpoint.replace(/\/+$/, "")}/v1`;

  return (
    <>
      <Reveal delay={0.05} className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border bg-card p-6 md:p-8">
          <span className="eyebrow">Step 1 — Authorize</span>
          <h2 className="font-display mt-4 text-3xl leading-tight tracking-tight">
            Connect with Claude Code
          </h2>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
            Click below to start the OAuth handshake with Anthropic. We never see or store your
            password — only a refreshable token, kept in the local Convex{" "}
            <code className="font-mono text-foreground">oauthTokens</code> table.
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
              <span className="eyebrow">Step 2 — Configure Cursor</span>
              <h2 className="font-display text-3xl leading-tight tracking-tight">
                Add a custom OpenAI provider
              </h2>
            </div>
            <span className="text-xs text-muted-foreground">
              Endpoint:{" "}
              <span className="font-mono text-foreground">{stripProtocol(endpoint)}</span>
            </span>
          </div>

          <div className="grid gap-6 md:grid-cols-[1fr_1fr] [&>*]:min-w-0">
            <ol className="space-y-4 rounded-xl border bg-card p-6 text-sm md:p-8">
              <Step n={1}>
                Open Cursor → <strong className="text-foreground">Settings</strong> →{" "}
                <strong className="text-foreground">Models</strong>.
              </Step>
              <Step n={2}>
                Scroll to <strong className="text-foreground">OpenAI API Key</strong> and click{" "}
                <strong className="text-foreground">Override OpenAI Base URL</strong>.
              </Step>
              <Step n={3}>
                Paste the base URL below:
                <pre className="mt-2 overflow-x-auto rounded-md border bg-background px-3 py-2 font-mono text-xs">
                  {baseUrl}
                </pre>
              </Step>
              <Step n={4}>
                For the API key, type any non-empty string (e.g.{" "}
                <code className="font-mono text-foreground">cctc</code>). The proxy ignores it —
                auth is enforced via OAuth + IP allow-list.
              </Step>
              <Step n={5}>
                Add a custom model named exactly{" "}
                <code className="font-mono text-foreground">claude</code> (lowercase). Enable it.
              </Step>
              <Step n={6}>
                Click <strong className="text-foreground">Verify</strong>. Cursor pings{" "}
                <code className="font-mono text-foreground">/v1/models</code> on your proxy.
              </Step>
            </ol>

            <SnippetCard
              title="Copy-paste reference"
              description="The exact values to drop into Cursor's settings."
              language="text"
              snippet={snippets.cursor}
              pillLabel="Cursor"
            />
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.15}>
        <div className="rounded-xl border bg-card p-6 md:p-8">
          <span className="eyebrow">Step 3 — Use it</span>
          <h2 className="font-display mt-4 text-3xl leading-tight tracking-tight">
            Pick <code className="font-mono">claude</code> in any chat
          </h2>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
            In a Cursor chat or composer, switch the model picker to{" "}
            <code className="font-mono text-foreground">claude</code>. Every prompt now flows
            through this proxy, gets routed to your selected Claude model, and burns your Claude
            Code subscription quota — not Cursor credits.
          </p>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
            Want to change the underlying Claude model, the thinking effort, or your subscription
            tier? Head to{" "}
            <Link href="/preferences" className="text-foreground underline-offset-4 hover:underline">
              Preferences
            </Link>
            . Want to inspect what&apos;s flowing through?{" "}
            <Link href="/usage" className="text-foreground underline-offset-4 hover:underline">
              Usage
            </Link>{" "}
            shows every request, token and dollar.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="sm">
              <Link href="/preferences">Open preferences</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/usage">See usage</Link>
            </Button>
          </div>
        </div>
      </Reveal>
    </>
  );
}

function IntegrationsBodySkeleton() {
  return (
    <div className="space-y-12">
      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <Skeleton className="h-72 w-full rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
      <Skeleton className="h-96 w-full rounded-xl" />
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border bg-background font-mono text-[11px] tabular text-muted-foreground">
        {n}
      </span>
      <span className="leading-relaxed text-muted-foreground">{children}</span>
    </li>
  );
}
