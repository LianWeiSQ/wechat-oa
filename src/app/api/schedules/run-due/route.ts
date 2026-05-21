import { errorJson, stores } from "@/app/api/_helpers";
import { runDueScheduledArticleTasks } from "@/lib/scheduled-generation";

export const runtime = "nodejs";

export async function POST() {
  try {
    const { draftStore, scheduleStore, settingsStore } = stores();
    const results = await runDueScheduledArticleTasks({
      scheduleStore,
      draftStore,
      settingsStore,
      limit: 10,
    });
    return Response.json({ results, tasks: await scheduleStore.listTasksWithRuns() });
  } catch (error) {
    return errorJson(error);
  }
}
