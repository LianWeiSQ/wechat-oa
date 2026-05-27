import { describe, expect, it } from "vitest";
import { ANALYSIS_TEMPLATES } from "@/lib/analysis";
import { createArticleStore } from "@/lib/articles";
import { createContentAgentStore, runContentAgent } from "@/lib/content-agent";
import { openDatabase } from "@/lib/db";
import type { AiSettings, Article } from "@/lib/types";

const article: Article = {
  id: "art_agent",
  title: "Agent 工程化成本拆解",
  sourceType: "web",
  sourceName: "AI Systems",
  sourceAccount: "AI Systems",
  originalUrl: "https://example.com/agent",
  author: "Lin",
  publishedAt: "2026-05-10",
  contentHtml: "<p>Agent 成本来自工具调用、权限边界、评测缺失和上下文膨胀。</p>",
  contentText: "Agent 成本来自工具调用、权限边界、评测缺失和上下文膨胀。",
  content: "Agent 成本来自工具调用、权限边界、评测缺失和上下文膨胀。",
  category: "AI Agent",
  isFavorite: false,
  tags: ["agent", "成本"],
  createdAt: "2026-05-14T00:00:00.000Z",
  updatedAt: "2026-05-14T00:00:00.000Z",
};

const settings: AiSettings = {
  baseUrl: "http://127.0.0.1:3000",
  apiKey: "sk-test",
  model: "gpt-5.4",
};

describe("content agent", () => {
  it("classifies article quality and recommends analysis templates", async () => {
    const db = openDatabase(":memory:");
    const savedArticle = createArticleStore(db).createArticle(article);
    const store = createContentAgentStore(db);

    const run = await runContentAgent(savedArticle, ANALYSIS_TEMPLATES, settings, store, async (request) => {
      expect(request.messages[1].content).toContain("Agent 工程化成本拆解");
      return {
        articleType: "technical-deep-dive",
        qualityScore: 82,
        recommendedTemplateIds: ["technical-deep-dive", "media"],
        recommendedAction: "analyze",
        reasoningSummary: "文章技术密度高，适合先技术拆解再做传播角度。",
        steps: [
          { name: "解析质量", status: "ok", message: "正文完整" },
          { name: "模板选择", status: "ok", message: "推荐技术深挖和媒体视角" },
        ],
      };
    });

    expect(run.status).toBe("completed");
    expect(run.articleType).toBe("technical-deep-dive");
    expect(run.recommendedTemplateIds).toEqual(["technical-deep-dive", "media"]);
    expect(store.listAgentRuns(savedArticle.id)[0].reasoningSummary).toContain("技术密度高");
  });

  it("saves a failed run when model configuration is missing", async () => {
    const db = openDatabase(":memory:");
    const savedArticle = createArticleStore(db).createArticle(article);
    const store = createContentAgentStore(db);

    const run = await runContentAgent(savedArticle, ANALYSIS_TEMPLATES, { ...settings, apiKey: "" }, store, async () => {
      throw new Error("should not call");
    });

    expect(run.status).toBe("failed");
    expect(run.reasoningSummary).toContain("请先配置");
    expect(store.listAgentRuns(savedArticle.id)).toHaveLength(1);
  });
});
