import { Suspense } from "react";
import { headers } from "next/headers";
import { PageHeader } from "~/components/layout/page-header";
import { Reveal } from "~/components/motion/reveal";
import { ErrorsCard } from "~/components/usage/errors-card";
import { PeriodTabs } from "~/components/usage/period-tabs";
import { RequestTable } from "~/components/usage/request-table";
import { ResetButton } from "~/components/usage/reset-button";
import { TimelineChart } from "~/components/usage/timeline-chart";
import { UsageSummary } from "~/components/usage/usage-summary";
import { Skeleton } from "~/components/ui/skeleton";
import {
  getAnalyticsErrors,
  getAnalyticsRequests,
  getAnalyticsSummary,
  getAnalyticsTimeline,
} from "~/lib/api";
import { type Period, periodSchema } from "~/lib/schemas";
import { getForwardedFor } from "~/lib/server/forwarded-for";

export const metadata = { title: "Usage" };

const PAGE_SIZE = 20;

interface UsagePageProps {
  searchParams: Promise<{ period?: string }>;
}

// Synchronous shell so Cache Components can pre-render. Each section
// awaits `searchParams` itself inside a Suspense boundary.
export default function UsagePage({ searchParams }: UsagePageProps) {
  return (
    <div className="space-y-10">
      <Suspense fallback={<HeaderFallback />}>
        <PeriodHeader searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-32 w-full rounded-xl" />}>
        <SummarySection searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
        <TimelineSection searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-32 w-full rounded-xl" />}>
        <ErrorsSection searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <RequestsSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function resolvePeriod(searchParams: Promise<{ period?: string }>): Promise<Period> {
  const params = await searchParams;
  return periodSchema.safeParse(params.period ?? "day").data ?? "day";
}

async function getIp(): Promise<string | undefined> {
  return getForwardedFor(await headers());
}

async function PeriodHeader({ searchParams }: UsagePageProps) {
  const period = await resolvePeriod(searchParams);
  return (
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
  );
}

async function SummarySection({ searchParams }: UsagePageProps) {
  const [period, ip] = await Promise.all([resolvePeriod(searchParams), getIp()]);
  const summary = await getAnalyticsSummary(period, ip).catch(() => undefined);
  return (
    <Reveal delay={0.05}>
      <UsageSummary period={period} initial={summary} />
    </Reveal>
  );
}

async function TimelineSection({ searchParams }: UsagePageProps) {
  const [period, ip] = await Promise.all([resolvePeriod(searchParams), getIp()]);
  const timeline = await getAnalyticsTimeline(period, ip).catch(() => undefined);
  return (
    <Reveal delay={0.1}>
      <TimelineChart period={period} initial={timeline} />
    </Reveal>
  );
}

async function ErrorsSection({ searchParams }: UsagePageProps) {
  const [period, ip] = await Promise.all([resolvePeriod(searchParams), getIp()]);
  const errors = await getAnalyticsErrors(period, 5, ip).catch(() => undefined);
  return (
    <Reveal delay={0.15}>
      <ErrorsCard period={period} initial={errors} />
    </Reveal>
  );
}

async function RequestsSection({ searchParams }: UsagePageProps) {
  const [period, ip] = await Promise.all([resolvePeriod(searchParams), getIp()]);
  // SSR seeds the first page only; the table manages pagination client-side
  // via cursor stack (see RequestTable).
  const requests = await getAnalyticsRequests(period, PAGE_SIZE, null, ip).catch(
    () => undefined,
  );
  return (
    <Reveal delay={0.2}>
      <RequestTable period={period} pageSize={PAGE_SIZE} initial={requests} />
    </Reveal>
  );
}

function HeaderFallback() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-12 w-full max-w-xl" />
      <Skeleton className="h-4 w-full max-w-2xl" />
    </div>
  );
}
