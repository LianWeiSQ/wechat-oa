import { describe, expect, it, vi } from "vitest";
import {
  createOriginalDraftRequest,
  createWritingStructureRequest,
  ensureWritingStructureRuns,
  findSourceReuseWarnings,
  generateOriginalDraftFromTopic,
  generateWritingBlueprint,
  parseWritingBlueprintResponse,
  parseWritingStructureResponse,
} from "@/lib/writing-agent";
import type { AiSettings, Article, WritingStructureRun } from "@/lib/types";

const article: Article = {
  id: "art_agent",
  title: "想转 Agent 工程师，先补齐工程闭环",
  sourceType: "wechat",
  sourceName: "AI Systems",
  sourceAccount: "AI Systems",
  originalUrl: "https://mp.weixin.qq.com/s/agent",
  author: "Lin",
  publishedAt: "2026-05-18",
  contentHtml: "<p>很多人只会调 API，但 Agent 项目真正难在任务拆解、工具权限、状态管理和评估闭环。</p>",
  contentText: "很多人只会调 API，但 Agent 项目真正难在任务拆解、工具权限、状态管理和评估闭环。",
  content: "很多人只会调 API，但 Agent 项目真正难在任务拆解、工具权限、状态管理和评估闭环。",
  category: "AI Agent",
  isFavorite: false,
  tags: ["Agent"],
  createdAt: "now",
  updatedAt: "now",
};

const secondArticle: Article = {
  ...article,
  id: "art_bench",
  title: "Agent Benchmark 开始测试长期反馈",
  originalUrl: "https://mp.weixin.qq.com/s/bench",
  contentText: "真实工程优化不是做题，而是在反馈里持续修改参数、验证结果、修复失败模式。",
};

const settings: AiSettings = {
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-test",
  model: "gpt-5.2",
};

const structureRun: WritingStructureRun = {
  id: "wstruct_existing",
  articleId: article.id,
  qualityScore: 88,
  structure: {
    titlePattern: "职业转型 + 反常识",
    openingHook: "从项目卡点开场",
    pressurePoint: "只会 API 调用不够",
    ethicalRewrite: "指出能力差距并给路径",
    technicalBackbone: ["任务拆解", "工具权限", "状态管理", "评估闭环"],
    evidencePattern: ["项目场景", "工程约束"],
    pacingPattern: "短段落推进",
    reusableMoves: ["场景开头", "框架拆解"],
    antiPatterns: ["再不学就淘汰", "加微信领取"],
  },
  modelMetadata: { provider: "openai-compatible", model: "gpt-5.2" },
  createdAt: "now",
};

describe("writing structure agent", () => {
  it("builds a prompt for structure assets, ethical anxiety rewrites, and no sales CTA", () => {
    const request = createWritingStructureRequest(article, "gpt-5.2");
    const prompt = request.messages.map((message) => message.content).join("\n");

    expect(prompt).toContain("结构资产");
    expect(prompt).toContain("焦虑改写");
    expect(prompt).toContain("技术骨架");
    expect(prompt).toContain("禁用销售 CTA");
  });

  it("parses structure and blueprint responses", () => {
    const structure = parseWritingStructureResponse(
      JSON.stringify({
        structure: structureRun.structure,
        qualityScore: 91,
      }),
    );
    expect(structure.qualityScore).toBe(91);
    expect(structure.structure.technicalBackbone).toContain("工具权限");

    const blueprint = parseWritingBlueprintResponse({
      name: "Agent 转型原创蓝图",
      summary: "从真实卡点进入，给工程框架和项目建议。",
      sectionPlan: [{ title: "真实场景", purpose: "开场", guidance: "用项目卡点" }],
      toneRules: ["克制"],
      bannedExpressions: ["加微信"],
    });
    expect(blueprint.name).toBe("Agent 转型原创蓝图");
    expect(blueprint.sectionPlan[0].title).toBe("真实场景");
  });

  it("reuses existing structure runs and generates missing ones before blueprint creation", async () => {
    const saveStructureRun = vi.fn(async (run: WritingStructureRun) => run);
    const writingStore = {
      saveStructureRun,
      listStructureRuns: vi.fn(async (articleId?: string) => (articleId === article.id ? [structureRun] : [])),
      saveBlueprint: vi.fn(),
      getBlueprint: vi.fn(),
    };
    const modelClient = vi.fn(async () =>
      JSON.stringify({
        structure: {
          ...structureRun.structure,
          titlePattern: "Benchmark 趋势标题",
        },
        qualityScore: 84,
      }),
    );

    const runs = await ensureWritingStructureRuns({
      articles: [article, secondArticle],
      settings,
      writingStore,
      modelClient,
    });

    expect(runs).toHaveLength(2);
    expect(modelClient).toHaveBeenCalledTimes(1);
    expect(saveStructureRun).toHaveBeenCalledTimes(1);
  });

  it("builds original draft prompts with topic, blueprint, references, and pure-content constraints", () => {
    const request = createOriginalDraftRequest({
      topic: "想转 Agent 工程师，先补齐哪些工程能力？",
      articles: [article],
      blueprint: {
        id: "wblue_1",
        name: "Agent 转型原创蓝图",
        sourceArticleIds: [article.id],
        summary: "从真实卡点进入，给工程框架和项目建议。",
        sectionPlan: [{ title: "真实场景", purpose: "开场", guidance: "用项目卡点" }],
        toneRules: ["克制"],
        bannedExpressions: ["加微信"],
        modelMetadata: { provider: "openai-compatible", model: "gpt-5.2" },
        createdAt: "now",
        updatedAt: "now",
      },
      structureRuns: [structureRun],
      model: "gpt-5.2",
    });
    const prompt = request.messages.map((message) => message.content).join("\n");

    expect(prompt).toContain("想转 Agent 工程师");
    expect(prompt).toContain("不洗稿");
    expect(prompt).toContain("不要课程、社群、资料领取");
    expect(prompt).toContain("真实场景开头 -> 反常识判断");
  });

  it("creates a draft and flags copied long source sentences", async () => {
    const draftStore = {
      createDraft: vi.fn(async (input) => ({
        id: "draft_1",
        title: input.title,
        body: input.body,
        sourceAnalysisIds: input.sourceAnalysisIds,
        exportFormat: input.exportFormat,
        wechatDraftStatus: "not_sent" as const,
        createdAt: "now",
        updatedAt: "now",
      })),
    };

    const result = await generateOriginalDraftFromTopic({
      topic: "Agent 转型能力",
      articles: [article],
      structureRuns: [structureRun],
      settings,
      draftStore,
      modelClient: async () =>
        JSON.stringify({
          title: "Agent 转型能力",
          deck: "别只会调 API。",
          bodyHtml:
            "<h1>Agent 转型能力</h1><p>很多人只会调 API，但 Agent 项目真正难在任务拆解、工具权限、状态管理和评估闭环。</p>",
        }),
    });

    expect(result.draft.title).toBe("Agent 转型能力");
    expect(result.warnings[0].matchedText).toContain("很多人只会调 API");
    expect(draftStore.createDraft).toHaveBeenCalled();
  });

  it("finds reused source text in generated HTML", () => {
    const warnings = findSourceReuseWarnings(
      "<p>很多人只会调 API，但 Agent 项目真正难在任务拆解、工具权限、状态管理和评估闭环。</p>",
      [article],
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0].sourceArticleId).toBe(article.id);
  });

  it("generates a blueprint with an injected model client", async () => {
    const blueprint = await generateWritingBlueprint({
      articles: [article],
      structureRuns: [structureRun],
      settings,
      modelClient: async () =>
        JSON.stringify({
          name: "Agent 转型原创蓝图",
          summary: "从真实卡点进入。",
          sectionPlan: [{ title: "真实场景", purpose: "开场", guidance: "用项目卡点" }],
          toneRules: ["克制"],
          bannedExpressions: ["加微信"],
        }),
    });

    expect(blueprint.sourceArticleIds).toEqual([article.id]);
    expect(blueprint.bannedExpressions).toContain("训练营报名");
  });
});
