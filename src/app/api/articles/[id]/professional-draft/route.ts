import { errorJson, stores } from "@/app/api/_helpers";
import { createDraftContextAnalysisRun } from "@/lib/analysis";
import { createProfessionalDraftWithImages } from "@/lib/professional-drafts";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { analysisRunId } = (await request.json().catch(() => ({}))) as { analysisRunId?: string };
    const { articleStore, draftStore, draftImageStore, settingsStore } = stores();
    const article = await articleStore.getArticle(id);
    if (!article) {
      return Response.json({ error: "文章不存在" }, { status: 404 });
    }

    const analysisRuns = await articleStore.listAnalysisRuns(id);
    const existingAnalysisRun = analysisRunId
      ? analysisRuns.find((run) => run.id === analysisRunId)
      : analysisRuns[0];
    const analysisRun = existingAnalysisRun ?? (await articleStore.saveAnalysisRun(createDraftContextAnalysisRun(article)));

    const result = await createProfessionalDraftWithImages({
      article,
      analysisRun,
      aiSettings: await settingsStore.getAiSettings(),
      imageSettings: await settingsStore.getImageSettings(),
      draftStore,
      draftImageStore,
    });

    return Response.json(result);
  } catch (error) {
    return errorJson(error);
  }
}
