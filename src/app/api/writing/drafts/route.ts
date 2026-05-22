import { errorJson, stores } from "@/app/api/_helpers";
import { createReviewAiSettings, ensureWritingStructureRuns, generateOriginalDraftFromTopic } from "@/lib/writing-agent";
import type { Article } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { topic, referenceArticleIds, blueprintId } = (await request.json().catch(() => ({}))) as {
      topic?: string;
      referenceArticleIds?: string[];
      blueprintId?: string;
    };
    const trimmedTopic = String(topic ?? "").trim();
    const articleIds = Array.from(new Set((referenceArticleIds ?? []).map((id) => String(id).trim()).filter(Boolean)));

    if (!trimmedTopic) {
      return Response.json({ error: "请输入选题" }, { status: 400 });
    }
    if (articleIds.length === 0) {
      return Response.json({ error: "请至少选择一篇参考文章" }, { status: 400 });
    }

    const { articleStore, draftStore, settingsStore, writingStore } = stores();
    const articles = (await Promise.all(articleIds.map((id) => articleStore.getArticle(id)))).filter(
      (article): article is Article => Boolean(article),
    );
    if (articles.length === 0) {
      return Response.json({ error: "参考文章不存在" }, { status: 404 });
    }

    const settings = await settingsStore.getAiSettings();
    const reviewSettings = createReviewAiSettings(settings);
    const structureRuns = await ensureWritingStructureRuns({
      articles,
      settings: reviewSettings,
      writingStore,
    });
    const blueprint = blueprintId?.trim() ? await writingStore.getBlueprint(blueprintId.trim()) : null;
    if (blueprintId?.trim() && !blueprint) {
      return Response.json({ error: "写作蓝图不存在" }, { status: 404 });
    }

    const result = await generateOriginalDraftFromTopic({
      topic: trimmedTopic,
      articles,
      blueprint,
      structureRuns,
      settings,
      reviewSettings,
      draftStore,
    });

    return Response.json({ ...result, structureRuns });
  } catch (error) {
    return errorJson(error);
  }
}
