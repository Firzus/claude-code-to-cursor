import { headers } from "next/headers";
import { PageHeader } from "~/components/layout/page-header";
import { Reveal } from "~/components/motion/reveal";
import { AdvancedPanel } from "~/components/preferences/advanced-panel";
import { PreferencesForm } from "~/components/preferences/preferences-form";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { getSettings } from "~/lib/api";
import { getForwardedFor } from "~/lib/server/forwarded-for";

export const metadata = { title: "Preferences" };
export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const ip = getForwardedFor(await headers());
  const settings = await getSettings(ip).catch(() => undefined);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Preferences"
        title="Tune your proxy."
        description="Choose the model the proxy serves by default, decide how hard it should think, and pick your subscription tier for accurate quotas."
      />

      {settings ? (
        <Reveal delay={0.05}>
          <PreferencesForm defaultValues={settings.settings} />
        </Reveal>
      ) : (
        <Alert variant="destructive">
          <AlertTitle>Settings unavailable</AlertTitle>
          <AlertDescription>
            We couldn't load the current settings from the API. Check that the API service is
            running, then refresh.
          </AlertDescription>
        </Alert>
      )}

      <Reveal delay={0.12}>
        <AdvancedPanel />
      </Reveal>
    </div>
  );
}
