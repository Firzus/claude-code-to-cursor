import { Suspense } from "react";
import { headers } from "next/headers";
import { PageHeader } from "~/components/layout/page-header";
import { Reveal } from "~/components/motion/reveal";
import { AdvancedPanel } from "~/components/preferences/advanced-panel";
import { PreferencesForm } from "~/components/preferences/preferences-form";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Skeleton } from "~/components/ui/skeleton";
import { getSettings } from "~/lib/api";
import { getForwardedFor } from "~/lib/server/forwarded-for";

export const metadata = { title: "Preferences" };

export default async function PreferencesPage() {
  const ip = getForwardedFor(await headers());

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Preferences"
        title="Tune your proxy."
        description="Choose the model the proxy serves by default, decide how hard it should think, and pick your subscription tier for accurate quotas."
      />

      <Suspense fallback={<Skeleton className="h-[28rem] w-full rounded-xl" />}>
        <SettingsSection ip={ip} />
      </Suspense>

      <Reveal delay={0.12}>
        <AdvancedPanel />
      </Reveal>
    </div>
  );
}

async function SettingsSection({ ip }: { ip?: string }) {
  const settings = await getSettings(ip).catch(() => undefined);

  if (!settings) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Settings unavailable</AlertTitle>
        <AlertDescription>
          We couldn&apos;t load the current settings from the API. Check that the API service is
          running, then refresh.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Reveal delay={0.05}>
      <PreferencesForm defaultValues={settings.settings} />
    </Reveal>
  );
}
