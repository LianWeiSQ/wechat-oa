import { errorJson, stores } from "@/app/api/_helpers";
import { ANALYSIS_TEMPLATES, analyzeArticle } from "@/lib/analysis";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { templateId } = (await request.json()) as { templateId?: string };
    const { articleStore, settingsStore } = stores();
    const article = await articleStore.getArticle(id);
    if (!article) {
      return Response.json({ error: "文章不存在" }, { status: 404 });
    }
    const template = ANALYSIS_TEMPLATES.find((item) => item.id === templateId) ?? ANALYSIS_TEMPLATES[0];
    const analysisRun = await analyzeArticle(article, template, await settingsStore.getAiSettings());
    await articleStore.saveAnalysisRun(analysisRun);
    return Response.json({ analysisRun });
  } catch (error) {
    return errorJson(error);
  }
}
