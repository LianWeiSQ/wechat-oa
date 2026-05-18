import { errorJson, stores } from "@/app/api/_helpers";
import { ensureWritingStructureRuns, generateWritingBlueprint } from "@/lib/writing-agent";
import type { Article } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { writingStore } = stores();
    return Response.json({ blueprints: await writingStore.listBlueprints() });
  } catch (error) {
    return errorJson(error);
  }
}

export async function POST(request: Request) {
  try {
    const { articleIds } = (await request.json().catch(() => ({}))) as { articleIds?: string[] };
    const referenceArticleIds = Array.from(new Set((articleIds ?? []).map((id) => String(id).trim()).filter(Boolean)));
    if (referenceArticleIds.length === 0) {
      return Response.json({ error: "请至少选择一篇参考文章" }, { status: 400 });
    }

    const { articleStore, settingsStore, writingStore } = stores();
    const articles = (await Promise.all(referenceArticleIds.map((id) => articleStore.getArticle(id)))).filter(
      (article): article is Article => Boolean(article),
    );
    if (articles.length === 0) {
      return Response.json({ error: "参考文章不存在" }, { status: 404 });
    }

    const settings = await settingsStore.getAiSettings();
    const structureRuns = await ensureWritingStructureRuns({
      articles,
      settings,
      writingStore,
    });
    const blueprint = await generateWritingBlueprint({
      articles,
      structureRuns,
      settings,
      writingStore,
    });

    return Response.json({ blueprint, structureRuns });
  } catch (error) {
    return errorJson(error);
  }
}
