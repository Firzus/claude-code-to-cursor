import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "~/components/layout/page-header";
import { Reveal } from "~/components/motion/reveal";
import { HealthCard } from "~/components/overview/health-card";
import { PlanUsageCard } from "~/components/overview/plan-usage-card";
import { RecentStrip } from "~/components/overview/recent-strip";
import { TodayStats } from "~/components/overview/today-stats";
import { Skeleton } from "~/components/ui/skeleton";
import { getAnalyticsRequests, getBudget, getHealth, getPlanUsage, getSettings } from "~/lib/api";
import { modelLabel } from "~/lib/format";
import { getForwardedFor } from "~/lib/server/forwarded-for";

export default async function OverviewPage() {
  const ip = getForwardedFor(await headers());

  return (
    <div className="space-y-10 md:space-y-14">
      <Suspense fallback={<HeaderSkeleton />}>
        <OverviewHeader ip={ip} />
      </Suspense>
      <Suspense fallback={<CardSkeleton tall />}>
        <HealthSection ip={ip} />
      </Suspense>
      <Suspense fallback={<CardSkeleton tall />}>
        <PlanSection ip={ip} />
      </Suspense>
      <Suspense fallback={<CardSkeleton />}>
        <BudgetSection ip={ip} />
      </Suspense>
      <Suspense fallback={<CardSkeleton tall />}>
        <RecentSection ip={ip} />
      </Suspense>
    </div>
  );
}

async function OverviewHeader({ ip }: { ip?: string }) {
  // The auth gate lives here so the redirect happens before we render anything
  // dynamic. Health is the cheapest of the page's reads, so colocating it with
  // the gate keeps the static shell renderable in parallel.
  const [health, settings] = await Promise.all([
    getHealth(ip).catch(() => undefined),
    getSettings(ip).catch(() => undefined),
  ]);

  if (health && !health.claudeCode.authenticated) {
    redirect("/welcome");
  }

  const description = settings
    ? `Your proxy is online, routing ${modelLabel(settings.settings.selectedModel)} through Claude Code's OAuth credentials.`
    : "Live signal on the proxy: OAuth, plan usage, and the requests flowing through it.";

  return (
    <PageHeader
      eyebrow="Overview"
      title="A calm, honest view of your proxy."
      description={description}
    />
  );
}

async function HealthSection({ ip }: { ip?: string }) {
  const health = await getHealth(ip).catch(() => undefined);
  return (
    <Reveal delay={0.05}>
      <HealthCard initial={health} />
    </Reveal>
  );
}

async function PlanSection({ ip }: { ip?: string }) {
  const planUsage = await getPlanUsage(ip).catch(() => undefined);
  return (
    <Reveal delay={0.12}>
      <PlanUsageCard initial={planUsage} />
    </Reveal>
  );
}

async function BudgetSection({ ip }: { ip?: string }) {
  const budget = await getBudget(ip).catch(() => undefined);
  return (
    <Reveal delay={0.18}>
      <TodayStats initial={budget} />
    </Reveal>
  );
}

async function RecentSection({ ip }: { ip?: string }) {
  const recent = await getAnalyticsRequests("day", 1, 8, ip).catch(() => undefined);
  return (
    <Reveal delay={0.24}>
      <RecentStrip initial={recent} />
    </Reveal>
  );
}

function HeaderSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-12 w-full max-w-xl" />
      <Skeleton className="h-4 w-full max-w-2xl" />
    </div>
  );
}

function CardSkeleton({ tall = false }: { tall?: boolean }) {
  return <Skeleton className={tall ? "h-44 w-full rounded-xl" : "h-32 w-full rounded-xl"} />;
}
