import { headers } from "next/headers";
import { PageHeader } from "~/components/layout/page-header";
import { Reveal } from "~/components/motion/reveal";
import { ErrorsCard } from "~/components/usage/errors-card";
import { PeriodTabs } from "~/components/usage/period-tabs";
import { RequestTable } from "~/components/usage/request-table";
import { ResetButton } from "~/components/usage/reset-button";
import { TimelineChart } from "~/components/usage/timeline-chart";
import { UsageSummary } from "~/components/usage/usage-summary";
import {
  getAnalyticsErrors,
  getAnalyticsRequests,
  getAnalyticsSummary,
  getAnalyticsTimeline,
} from "~/lib/api";
import { periodSchema } from "~/lib/schemas";
import { getForwardedFor } from "~/lib/server/forwarded-for";

export const metadata = { title: "Usage" };

const PAGE_SIZE = 20;

interface UsagePageProps {
  searchParams: Promise<{ period?: string; page?: string }>;
}

export default async function UsagePage({ searchParams }: UsagePageProps) {
  const params = await searchParams;
  const period = periodSchema.safeParse(params.period ?? "day").data ?? "day";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const ip = getForwardedFor(await headers());

  const [summary, timeline, requests, errors] = await Promise.all([
    getAnalyticsSummary(period, ip).catch(() => undefined),
    getAnalyticsTimeline(period, ip).catch(() => undefined),
    getAnalyticsRequests(period, page, PAGE_SIZE, ip).catch(() => undefined),
    getAnalyticsErrors(period, 5, ip).catch(() => undefined),
  ]);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Usage"
        title="What flowed through your proxy."
        description="Requests, tokens, cache, errors. Updated live every 30 seconds — pick a window to drill in."
        actions={
          <div className="flex items-center gap-2">
            <PeriodTabs value={period} />
            <ResetButton />
          </div>
        }
      />

      <Reveal delay={0.05}>
        <UsageSummary period={period} initial={summary} />
      </Reveal>

      <Reveal delay={0.1}>
        <TimelineChart period={period} initial={timeline} />
      </Reveal>

      <Reveal delay={0.15}>
        <ErrorsCard period={period} initial={errors} />
      </Reveal>

      <Reveal delay={0.2}>
        <RequestTable period={period} page={page} pageSize={PAGE_SIZE} initial={requests} />
      </Reveal>
    </div>
  );
}
