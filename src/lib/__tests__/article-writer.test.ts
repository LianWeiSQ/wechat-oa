import { describe, expect, it } from "vitest";
import {
  createProfessionalDraftRequest,
  generateProfessionalArticleDraft,
  parseProfessionalDraftResponse,
} from "@/lib/article-writer";
import type { AiSettings, AnalysisRun, Article } from "@/lib/types";

const article: Article = {
  id: "art_1",
  title: "AI Agent 落地难在哪里",
  sourceType: "web",
  sourceName: "AI Research",
  sourceAccount: "AI Research",
  originalUrl: "local://1",
  author: "William",
  publishedAt: "2026-05-14",
  contentHtml: "<p>很多团队发现 Agent demo 很强，但上线后卡在权限、审计和回滚。</p>",
  contentText: "很多团队发现 Agent demo 很强，但上线后卡在权限、审计和回滚。",
  content: "很多团队发现 Agent demo 很强，但上线后卡在权限、审计和回滚。",
  category: "AI Agent",
  isFavorite: false,
  tags: ["agent"],
  createdAt: "now",
  updatedAt: "now",
};

const run: AnalysisRun = {
  id: "run_1",
  articleId: "art_1",
  templateId: "technical-deep-dive",
  templateName: "技术深挖",
  lens: "硬核技术读者",
  summary: "Agent 的核心难点是工程控制面。",
  technicalInsights: ["需要工具权限边界", "需要可观测和回滚"],
  risks: ["模型误调用工具", "成本不可控"],
  reusableAngles: ["Agent 工程化", "控制面"],
  viralScore: {
    total: 88,
    dimensions: { pain: 22, novelty: 21, evidence: 23, debate: 22 },
    reasons: ["痛点强"],
  },
  topicCandidates: [],
  modelMetadata: { provider: "openai-compatible", model: "gpt-5.2" },
  createdAt: "now",
};

describe("professional article writer", () => {
  it("builds a Harness-like but WeChat-readable writing prompt", () => {
    const request = createProfessionalDraftRequest(article, run, "gpt-5.2");
    const prompt = request.messages.map((message) => message.content).join("\n");

    expect(prompt).toContain("生产约束");
    expect(prompt).toContain("架构取舍");
    expect(prompt).toContain("失败模式");
    expect(prompt).toContain("不要使用 首先/其次/综上");
    expect(prompt).toContain("imageBriefs");
  });

  it("parses structured draft output and preserves image briefs", () => {
    const parsed = parseProfessionalDraftResponse(
      JSON.stringify({
        title: "AI Agent 真正难的是工程化",
        deck: "会聊天不等于能上线。",
        bodyHtml: "<h1>AI Agent 真正难的是工程化</h1><p>上线难在控制面。</p>",
        pullQuotes: ["自由度越高，越需要工程边界。"],
        imageBriefs: [
          { role: "hero", prompt: "technical magazine cover", alt: "封面", caption: "封面说明" },
          { role: "explanation", prompt: "architecture diagram", alt: "架构图", caption: "架构说明" },
        ],
      }),
    );

    expect(parsed.imageBriefs).toHaveLength(2);
    expect(parsed.bodyHtml).toContain("<h1>");
  });

  it("generates a structured draft with an injected model client", async () => {
    const settings: AiSettings = {
      baseUrl: "http://127.0.0.1:8787/v1",
      apiKey: "codex-local",
      model: "gpt-5.2",
    };

    const draft = await generateProfessionalArticleDraft(article, run, settings, async () =>
      JSON.stringify({
        title: "AI Agent 真正难的是工程化",
        deck: "会聊天不等于能上线。",
        bodyHtml: "<h1>AI Agent 真正难的是工程化</h1><p>上线难在控制面。</p>",
        pullQuotes: [],
        imageBriefs: [{ role: "hero", prompt: "technical cover", alt: "封面", caption: "说明" }],
      }),
    );

    expect(draft.title).toBe("AI Agent 真正难的是工程化");
  });
});
