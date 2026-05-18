import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db";
import { createDraftImageStore } from "@/lib/draft-images";
import { createDraftStore } from "@/lib/drafts";
import { createProfessionalDraftWithImages } from "@/lib/professional-drafts";
import type { AiSettings, AnalysisRun, Article, ImageSettings } from "@/lib/types";

const article: Article = {
  id: "art_1",
  title: "AI Agent 落地难在哪里",
  sourceType: "web",
  sourceName: "AI Research",
  sourceAccount: "AI Research",
  originalUrl: "local://1",
  author: "William",
  publishedAt: "2026-05-14",
  contentHtml: "<p>Agent demo 很强，上线后卡在权限、审计和回滚。</p>",
  contentText: "Agent demo 很强，上线后卡在权限、审计和回滚。",
  content: "Agent demo 很强，上线后卡在权限、审计和回滚。",
  category: "AI Agent",
  isFavorite: false,
  tags: ["agent"],
  createdAt: "now",
  updatedAt: "now",
};

const analysisRun: AnalysisRun = {
  id: "run_1",
  articleId: article.id,
  templateId: "technical-deep-dive",
  templateName: "技术深挖",
  lens: "硬核技术读者",
  summary: "Agent 的核心难点是工程控制面。",
  technicalInsights: ["需要工具权限边界"],
  risks: ["成本不可控"],
  reusableAngles: ["Agent 工程化"],
  viralScore: { total: 88, dimensions: { pain: 22, novelty: 21, evidence: 23, debate: 22 }, reasons: ["痛点强"] },
  topicCandidates: [],
  modelMetadata: { provider: "openai-compatible", model: "gpt-5.2" },
  createdAt: "now",
};

const aiSettings: AiSettings = {
  baseUrl: "http://127.0.0.1:8787/v1",
  apiKey: "codex-local",
  model: "gpt-5.2",
};

const imageSettings: ImageSettings = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "sk-test",
  model: "gpt-image-2",
  size: "1536x1024",
};

describe("professional draft orchestration", () => {
  it("creates a draft, inserts generated image figures, and keeps failed image prompts", async () => {
    const db = openDatabase(":memory:");
    const draftStore = createDraftStore(db);
    const draftImageStore = createDraftImageStore(db);

    const result = await createProfessionalDraftWithImages({
      article,
      analysisRun,
      aiSettings,
      imageSettings,
      draftStore,
      draftImageStore,
      writer: async () => ({
        title: "AI Agent 真正难的是工程化",
        deck: "会聊天不等于能上线。",
        bodyHtml: "<h1>AI Agent 真正难的是工程化</h1><p>上线难在控制面。</p>",
        pullQuotes: [],
        imageBriefs: [
          { role: "hero", prompt: "hero prompt", alt: "封面", caption: "封面说明" },
          { role: "explanation", prompt: "diagram prompt", alt: "解释图", caption: "解释说明" },
        ],
      }),
      imageGenerator: async (input) => ({
        draftId: input.draftId,
        role: input.role,
        status: input.role === "hero" ? "generated" : "failed",
        localPath: input.role === "hero" ? "/tmp/hero.png" : "",
        publicPath: input.role === "hero" ? "/api/assets/images/hero.png" : "",
        prompt: input.prompt,
        revisedPrompt: "",
        alt: input.alt,
        caption: input.caption,
        model: imageSettings.model,
        size: imageSettings.size,
        error: input.role === "hero" ? "" : "quota exceeded",
      }),
    });

    expect(result.draft.title).toBe("AI Agent 真正难的是工程化");
    expect(result.draft.body).toContain('src="/api/assets/images/hero.png"');
    expect(result.draft.body).toContain("配图生成失败");
    expect(result.imageAssets).toHaveLength(2);
    expect(draftImageStore.listAssets(result.draft.id)).toHaveLength(2);
  });
});
