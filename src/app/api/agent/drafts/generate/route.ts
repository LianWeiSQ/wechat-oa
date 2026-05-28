import { errorJson, stores } from "@/app/api/_helpers";
import { generateAgentDraftPayload } from "@/lib/agent-workflow";
import type { Article, ContentChannel } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { topic, referenceArticleIds, strategyId, targetChannel } = (await request.json().catch(() => ({}))) as {
      topic?: string;
      referenceArticleIds?: string[];
      strategyId?: string;
      targetChannel?: ContentChannel;
    };
    const trimmedTopic = String(topic ?? "").trim();
    const articleIds = Array.from(new Set((referenceArticleIds ?? []).map((id) => String(id).trim()).filter(Boolean)));
    if (!trimmedTopic) {
      return Response.json({ error: "请输入选题" }, { status: 400 });
    }
    if (articleIds.length === 0) {
      return Response.json({ error: "请至少选择一篇引用知识库文章" }, { status: 400 });
    }

    const { agentStore, articleStore, settingsStore, writingStore } = stores();
    const strategies = await agentStore.ensureDefaultStrategies();
    const selectedStrategyId = String(strategyId ?? "").trim() || strategies.find((strategy) => strategy.status === "active")?.id || strategies[0]?.id;
    const strategy = selectedStrategyId ? await agentStore.getStrategy(selectedStrategyId) : null;
    if (!strategy) {
      return Response.json({ error: "Agent 策略不存在" }, { status: 404 });
    }

    const articles = (await Promise.all(articleIds.map((id) => articleStore.getArticle(id)))).filter(
      (article): article is Article => Boolean(article),
    );
    if (articles.length === 0) {
      return Response.json({ error: "引用知识库文章不存在" }, { status: 404 });
    }

    const settings = await settingsStore.getAiSettings();
    const { draftInput, runInput } = await generateAgentDraftPayload({
      topic: trimmedTopic,
      articles,
      strategy,
      settings,
      writingStore,
      channel: targetChannel === "xiaohongshu" ? "xiaohongshu" : "wechat",
    });
    const agentDraft = await agentStore.createDraft(draftInput);
    const agentRun = await agentStore.createRun({
      ...runInput,
      agentDraftId: agentDraft.id,
    });
    const savedDraft = await agentStore.updateDraft(agentDraft.id, { runId: agentRun.id });
    return Response.json({
      agentDraft: savedDraft ?? agentDraft,
      agentRun,
    });
  } catch (error) {
    return errorJson(error);
  }
}
