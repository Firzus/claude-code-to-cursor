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

// Synchronous shell so Cache Components can pre-render. Each dynamic
// section streams in via its own Suspense boundary below.
export default function OverviewPage() {
  return (
    <div className="space-y-10 md:space-y-14">
      <Suspense fallback={<HeaderSkeleton />}>
        <OverviewHeader />
      </Suspense>
      <Suspense fallback={<CardSkeleton tall />}>
        <HealthSection />
      </Suspense>
      <Suspense fallback={<CardSkeleton tall />}>
        <PlanSection />
      </Suspense>
      <Suspense fallback={<CardSkeleton />}>
        <BudgetSection />
      </Suspense>
      <Suspense fallback={<CardSkeleton tall />}>
        <RecentSection />
      </Suspense>
    </div>
  );
}

async function getIp(): Promise<string | undefined> {
  return getForwardedFor(await headers());
}

async function OverviewHeader() {
  const ip = await getIp();
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

async function HealthSection() {
  const ip = await getIp();
  const health = await getHealth(ip).catch(() => undefined);
  return (
    <Reveal delay={0.05}>
      <HealthCard initial={health} />
    </Reveal>
  );
}

async function PlanSection() {
  const ip = await getIp();
  const planUsage = await getPlanUsage(ip).catch(() => undefined);
  return (
    <Reveal delay={0.12}>
      <PlanUsageCard initial={planUsage} />
    </Reveal>
  );
}

async function BudgetSection() {
  const ip = await getIp();
  const budget = await getBudget(ip).catch(() => undefined);
  return (
    <Reveal delay={0.18}>
      <TodayStats initial={budget} />
    </Reveal>
  );
}

async function RecentSection() {
  const ip = await getIp();
  const recent = await getAnalyticsRequests("day", 8, null, ip).catch(() => undefined);
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
