import { stores } from "@/app/api/_helpers";
import { SettingsPage } from "@/components/settings-page";

export default async function SettingsRoute() {
  const { settingsStore } = stores();

  return (
    <SettingsPage
      initialAiSettings={await settingsStore.getAiSettings()}
      initialImageSettings={await settingsStore.getPublicImageSettings()}
      initialWeChatConfig={await settingsStore.getPublicWeChatConfig()}
    />
  );
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
