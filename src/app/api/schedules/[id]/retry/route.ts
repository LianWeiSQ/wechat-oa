import { errorJson, stores } from "@/app/api/_helpers";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { scheduleStore } = stores();
    const task = await scheduleStore.rescheduleForRetry(id);
    if (!task) {
      return Response.json({ error: "定时任务不存在" }, { status: 404 });
    }
    return Response.json({ task, tasks: await scheduleStore.listTasksWithRuns() });
  } catch (error) {
    return errorJson(error);
  }
}
