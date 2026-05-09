import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "~/components/layout/page-header";
import { Reveal } from "~/components/motion/reveal";
import { HealthCard } from "~/components/overview/health-card";
import { PlanUsageCard } from "~/components/overview/plan-usage-card";
import { RecentStrip } from "~/components/overview/recent-strip";
import { TodayStats } from "~/components/overview/today-stats";
import { getAnalyticsRequests, getBudget, getHealth, getPlanUsage, getSettings } from "~/lib/api";
import { modelLabel } from "~/lib/format";
import { getForwardedFor } from "~/lib/server/forwarded-for";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const ip = getForwardedFor(await headers());

  const [health, planUsage, budget, recent, settings] = await Promise.all([
    getHealth(ip).catch(() => undefined),
    getPlanUsage(ip).catch(() => undefined),
    getBudget(ip).catch(() => undefined),
    getAnalyticsRequests("day", 1, 8, ip).catch(() => undefined),
    getSettings(ip).catch(() => undefined),
  ]);

  if (health && !health.claudeCode.authenticated) {
    redirect("/welcome");
  }

  const description = settings
    ? `Your proxy is online, routing ${modelLabel(settings.settings.selectedModel)} through Claude Code's OAuth credentials.`
    : "Live signal on the proxy: OAuth, plan usage, and the requests flowing through it.";

  return (
    <div className="space-y-10 md:space-y-14">
      <PageHeader
        eyebrow="Overview"
        title="A calm, honest view of your proxy."
        description={description}
      />
      <Reveal delay={0.05}>
        <HealthCard initial={health} />
      </Reveal>
      <Reveal delay={0.12}>
        <PlanUsageCard initial={planUsage} />
      </Reveal>
      <Reveal delay={0.18}>
        <TodayStats initial={budget} />
      </Reveal>
      <Reveal delay={0.24}>
        <RecentStrip initial={recent} />
      </Reveal>
    </div>
  );
}
