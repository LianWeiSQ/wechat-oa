import { errorJson, stores } from "@/app/api/_helpers";
import { runScheduledArticleTask } from "@/lib/scheduled-generation";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { draftStore, scheduleStore, settingsStore } = stores();
    const result = await runScheduledArticleTask({
      taskId: id,
      scheduleStore,
      draftStore,
      settingsStore,
    });
    if (!result.task) {
      return Response.json({ error: "定时任务不存在" }, { status: 404 });
    }
    return Response.json({ ...result, tasks: await scheduleStore.listTasksWithRuns() });
  } catch (error) {
    return errorJson(error);
  }
}
