import { stores } from "@/app/api/_helpers";
import { GenerateStudio } from "@/components/generate-studio";

export default async function GeneratePage() {
  const { scheduleStore, settingsStore } = stores();
  const [aiSettings, wechatConfig, tasks] = await Promise.all([
    settingsStore.getAiSettings(),
    settingsStore.getPublicWeChatConfig(),
    scheduleStore.listTasksWithRuns(),
  ]);

  return (
    <GenerateStudio
      aiModel={aiSettings.model}
      aiReady={Boolean(aiSettings.apiKey.trim() && aiSettings.model.trim())}
      initialTasks={tasks}
      wechatReady={Boolean(wechatConfig.appId.trim() && wechatConfig.hasAppSecret)}
    />
  );
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
