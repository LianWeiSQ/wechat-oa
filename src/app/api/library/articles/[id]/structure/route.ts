import { errorJson, stores } from "@/app/api/_helpers";
import { analyzeWritingStructure } from "@/lib/writing-agent";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { articleStore, settingsStore, writingStore } = stores();
    const article = await articleStore.getArticle(id);
    if (!article) {
      return Response.json({ error: "文章不存在" }, { status: 404 });
    }
    const structureRun = await writingStore.saveStructureRun(
      await analyzeWritingStructure(article, await settingsStore.getAiSettings()),
    );
    return Response.json({ structureRun });
  } catch (error) {
    return errorJson(error);
  }
}
