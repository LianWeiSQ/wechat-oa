import { describe, expect, it, vi } from "vitest";
import {
  createEditorialBoardPlanRequest,
  createOriginalDraftRequest,
  createReviewAiSettings,
  createTechnicalBriefRequest,
  createWritingStructureRequest,
  EDITORIAL_BOARD_STRATEGY_ID,
  ensureWritingStructureRuns,
  findSourceReuseWarnings,
  generateEditorialBoardPlan,
  generateOriginalDraftFromTopic,
  generateWritingBlueprint,
  parseEditorialBoardPlanResponse,
  parseDraftReviewResponse,
  parseOriginalDraftResponse,
  parseTechnicalBriefResponse,
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
  model: "MiniMax-M2.7",
  reviewModel: "deepseek-v4-pro",
  reviewBaseUrl: "http://localhost:8080/v1",
  reviewApiKey: "sk-review",
  reviewWireApi: "chat-completions",
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
      technicalBrief: {
        targetReader: "想转 Agent 的后端工程师",
        topicJudgment: "从模型选型转向工程闭环。",
        coreClaim: "Harness 决定 Agent 能不能稳定跑完任务。",
        verifiedFacts: ["参考文章讨论工具权限和状态管理"],
        sourceBoundaries: ["不要写死不存在的源码路径"],
        sectionBrief: [{ title: "真实场景", mustSay: ["状态恢复"], evidence: ["参考文章"], avoid: ["假事故"] }],
        riskFlags: ["虚假场景风险"],
        styleInstructions: ["短段落"],
      },
      model: "gpt-5.2",
    });
    const prompt = request.messages.map((message) => message.content).join("\n");

    expect(prompt).toContain("想转 Agent 工程师");
    expect(prompt).toContain("不洗稿");
    expect(prompt).toContain("不要课程、社群、资料领取");
    expect(prompt).toContain("选题判断");
    expect(prompt).toContain("读者画像");
    expect(prompt).toContain("公众号手感");
    expect(prompt).toContain("editorialScore");
    expect(prompt).toContain("技术骨架 Agent 输出");
  });

  it("builds technical brief prompts and derives review settings", () => {
    const reviewSettings = createReviewAiSettings(settings);
    expect(reviewSettings.model).toBe("deepseek-v4-pro");
    expect(reviewSettings.baseUrl).toBe("http://localhost:8080/v1");

    const request = createTechnicalBriefRequest({
      topic: "Agent Harness 怎么落地？",
      articles: [article],
      structureRuns: [structureRun],
      model: reviewSettings.model,
    });
    const prompt = request.messages.map((message) => message.content).join("\n");

    expect(prompt).toContain("事实边界");
    expect(prompt).toContain("不能写死");
    expect(prompt).toContain("sourceBoundaries");
  });

  it("builds strategy one editorial board prompts with specialized agents", () => {
    const request = createEditorialBoardPlanRequest({
      topic: "OpenAI 大神教你如何榨干 Codex",
      articles: [article],
      channel: "wechat",
      structureRuns: [structureRun],
      technicalBrief: {
        targetReader: "想用 Codex 提升工程效率的后端工程师",
        topicJudgment: "从工具试用转向工程工作流。",
        coreClaim: "真正的差距不是会不会打开 Codex，而是能不能把它变成可复用流程。",
        verifiedFacts: ["参考文章讨论工具权限和状态管理"],
        sourceBoundaries: ["不要编造 OpenAI 内部最佳实践"],
        sectionBrief: [{ title: "工作流", mustSay: ["CLAUDE.md/Codex 指令资产"], evidence: ["参考文章"], avoid: ["卖课 CTA"] }],
        riskFlags: ["标题党风险"],
        styleInstructions: ["公众号短段落"],
      },
      model: "deepseek-v4-pro",
    });
    const prompt = request.messages.map((message) => message.content).join("\n");

    expect(prompt).toContain("策略一：编辑部流水线");
    expect(prompt).toContain("主编 Agent");
    expect(prompt).toContain("开头 Agent");
    expect(prompt).toContain("节奏 Agent");
    expect(prompt).toContain("排版 Agent");
    expect(prompt).toContain("图片插入 Agent");
    expect(prompt).toContain("可收藏清单 Agent");
    expect(prompt).toContain("审稿 Agent");
    expect(prompt).toContain("不洗稿");
    expect(prompt).toContain("销售 CTA");
  });

  it("parses technical briefs and draft reviews", () => {
    const brief = parseTechnicalBriefResponse({
      目标读者: "Agent 平台工程师",
      选题判断: "Harness 是落地瓶颈。",
      核心观点: "模型负责能力，Harness 负责稳定性。",
      可验证事实: ["参考文章讨论 ThreadState"],
      事实边界: ["源码路径需核验"],
      章节骨架: [{ 标题: "状态管理", 必须讲: ["唯一状态源"], 证据: ["ThreadState"], 避免: ["编造事故"] }],
      风险: ["事实风险"],
      表达要求: ["短段落"],
    });
    expect(brief.coreClaim).toContain("Harness");
    expect(brief.sectionBrief[0].evidence).toContain("ThreadState");

    const review = parseDraftReviewResponse(
      {
        review: {
          score: 83,
          passed: true,
          factIssues: ["删除未核验路径"],
          fakeSceneIssues: [],
          ctaIssues: [],
          styleIssues: [],
          compressionNotes: ["压缩开头"],
          revisionSummary: "已修订。",
          revisedDraft: {
            title: "Harness 决定 Agent 下限",
            bodyHtml: "<h1>Harness 决定 Agent 下限</h1>",
          },
        },
      },
      {
        title: "旧稿",
        deck: "",
        bodyHtml: "<h1>旧稿</h1>",
      },
    );
    expect(review.score).toBe(83);
    expect(review.revisedDraft?.title).toBe("Harness 决定 Agent 下限");
  });

  it("parses editorial board plans and fills missing agent roles", async () => {
    const plan = parseEditorialBoardPlanResponse({
      plan: {
        strategyName: "策略一：编辑部流水线",
        targetScore: 88,
        主编定调: "写给准备把 Agent 工具链做成工作流的工程师。",
        编辑部分工: [{ 名称: "主编 Agent", 职责: "定调", 任务: "压出核心判断", 指令: ["不卖焦虑"] }],
        标题方向: ["大神方法", "工程工作流"],
        开头方案: ["从面试官问 CLAUDE.md 开始"],
        节奏计划: ["首屏冲突", "中段拆机制"],
        排版要求: ["重点句用 blockquote"],
        图片方案: [{ role: "hero", prompt: "Codex 工作流架构图", alt: "工作流架构图", caption: "从提示词到验证闭环" }],
        可收藏清单: { 标题: "Codex 工作流检查表", 清单: ["是否有项目上下文", "是否有验收命令"] },
        审稿标准: ["无销售 CTA", "无假事故"],
      },
    });

    expect(plan.strategyId).toBe(EDITORIAL_BOARD_STRATEGY_ID);
    expect(plan.targetScore).toBe(88);
    expect(plan.agentPasses.some((agent) => agent.name.includes("图片插入"))).toBe(true);
    expect(plan.collectibleChecklist.items).toContain("是否有项目上下文");

    const generated = await generateEditorialBoardPlan({
      topic: "Codex 工作流",
      articles: [article],
      structureRuns: [structureRun],
      settings,
      modelClient: async () =>
        JSON.stringify({
          strategyId: EDITORIAL_BOARD_STRATEGY_ID,
          strategyName: "策略一：编辑部流水线",
          targetScore: 87,
          editorInChiefBrief: "把工具使用写成工程工作流。",
          agentPasses: [{ name: "开头 Agent", role: "开头", brief: "首屏给冲突", directives: ["真实场景"], riskFlags: [], status: "ok" }],
          titleAngles: ["Codex 工作流"],
          openingOptions: ["从工程师的配置文件开场"],
          rhythmPlan: ["开头", "拆解", "清单"],
          layoutDirectives: ["figure 占位"],
          imageBriefs: [{ role: "hero", prompt: "工作流首图", alt: "首图", caption: "工作流" }],
          collectibleChecklist: { title: "收藏清单", items: ["项目上下文", "验收命令"] },
          reviewRubric: ["不洗稿"],
        }),
    });
    expect(generated.editorInChiefBrief).toContain("工程工作流");
    expect(generated.agentPasses.some((agent) => agent.name.includes("审稿"))).toBe(true);
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

    const modelClient = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          targetReader: "想转 Agent 的后端工程师",
          topicJudgment: "读者需要从 API 调用转向工程闭环。",
          coreClaim: "Agent 工程的分水岭不是会不会调 API，而是能不能搭出工程闭环。",
          verifiedFacts: ["参考文章提到任务拆解、工具权限、状态管理和评估闭环"],
          sourceBoundaries: ["不要编造团队事故"],
          sectionBrief: [{ title: "工程闭环", mustSay: ["状态管理"], evidence: ["参考文章"], avoid: ["卖课 CTA"] }],
          riskFlags: ["长句复用风险"],
          styleInstructions: ["公众号短段落"],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
            title: "Agent 转型能力",
            deck: "别只会调 API。",
            readerProfile: "想转 Agent 的后端工程师",
            coreClaim: "Agent 工程的分水岭不是会不会调 API，而是能不能搭出工程闭环。",
            titleOptions: ["Agent 转型能力", "别只会调 API"],
            bodyHtml:
              "<h1>Agent 转型能力</h1><p>很多人只会调 API，但 Agent 项目真正难在任务拆解、工具权限、状态管理和评估闭环。</p>",
            editorialScore: {
              total: 78,
              topic: 80,
              readerFit: 76,
              opening: 72,
              viewpoint: 82,
              evidence: 70,
              pacing: 78,
              wechatReadability: 75,
              originality: 80,
              notes: ["观点清楚"],
              revisionPriority: ["补真实项目细节"],
            },
          }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          score: 80,
          passed: false,
          factIssues: [],
          fakeSceneIssues: [],
          ctaIssues: [],
          styleIssues: ["标题偏平"],
          compressionNotes: ["压缩开头"],
          revisionSummary: "保留核心判断，删掉冗余。",
          revisedDraft: {
            title: "别只会调 API，Agent 真正难在工程闭环",
            deck: "状态、工具和评估才是分水岭。",
            readerProfile: "想转 Agent 的后端工程师",
            coreClaim: "Agent 工程的分水岭不是会不会调 API，而是能不能搭出工程闭环。",
            titleOptions: ["别只会调 API，Agent 真正难在工程闭环"],
            bodyHtml:
              "<h1>别只会调 API，Agent 真正难在工程闭环</h1><p>很多人只会调 API，但 Agent 项目真正难在任务拆解、工具权限、状态管理和评估闭环。</p>",
            editorialScore: {
              total: 80,
              topic: 80,
              readerFit: 78,
              opening: 76,
              viewpoint: 82,
              evidence: 74,
              pacing: 80,
              wechatReadability: 82,
              originality: 80,
              notes: ["审稿后标题更明确"],
              revisionPriority: ["补真实项目细节"],
            },
          },
        }),
      );

    const result = await generateOriginalDraftFromTopic({
      topic: "Agent 转型能力",
      articles: [article],
      structureRuns: [structureRun],
      settings,
      reviewSettings: createReviewAiSettings(settings),
      draftStore,
      modelClient,
    });

    expect(result.draft.title).toBe("别只会调 API，Agent 真正难在工程闭环");
    expect(result.draftBeforeReview.title).toBe("Agent 转型能力");
    expect(result.originalDraft.editorialScore?.total).toBe(80);
    expect(result.review.styleIssues).toContain("标题偏平");
    expect(result.warnings[0].matchedText).toContain("很多人只会调 API");
    expect(modelClient).toHaveBeenNthCalledWith(1, expect.objectContaining({ model: "deepseek-v4-pro" }), expect.objectContaining({ model: "deepseek-v4-pro" }));
    expect(modelClient).toHaveBeenNthCalledWith(2, expect.objectContaining({ model: "MiniMax-M2.7" }), expect.objectContaining({ model: "MiniMax-M2.7" }));
    expect(modelClient).toHaveBeenNthCalledWith(3, expect.objectContaining({ model: "deepseek-v4-pro" }), expect.objectContaining({ model: "deepseek-v4-pro" }));
    expect(draftStore.createDraft).toHaveBeenCalled();
  });

  it("runs strategy one through the editorial board before drafting and review", async () => {
    const draftStore = {
      createDraft: vi.fn(async (input) => ({
        id: "draft_strategy_1",
        title: input.title,
        body: input.body,
        notes: input.notes,
        sourceAnalysisIds: input.sourceAnalysisIds,
        sourceArticleIds: input.sourceArticleIds,
        contentChannel: input.contentChannel,
        publishStatus: input.publishStatus,
        exportFormat: input.exportFormat,
        wechatDraftStatus: "not_sent" as const,
        createdAt: "now",
        updatedAt: "now",
      })),
    };
    const modelClient = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          targetReader: "想榨干 Codex 的工程师",
          topicJudgment: "从工具尝鲜转向工程资产。",
          coreClaim: "Codex 的上限来自上下文和验收闭环。",
          verifiedFacts: ["参考文章讨论任务拆解和评估闭环"],
          sourceBoundaries: ["不要编造 OpenAI 内部实践"],
          sectionBrief: [{ title: "上下文", mustSay: ["维护项目上下文"], evidence: ["参考文章"], avoid: ["卖课"] }],
          riskFlags: [],
          styleInstructions: ["短段落"],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          strategyId: EDITORIAL_BOARD_STRATEGY_ID,
          strategyName: "策略一：编辑部流水线",
          targetScore: 88,
          editorInChiefBrief: "这篇要写成第一篇定调稿，强调工程工作流而非工具崇拜。",
          agentPasses: [
            { name: "主编 Agent", role: "定调", brief: "给出核心判断", directives: ["不要洗稿"], riskFlags: [], status: "ok" },
            { name: "图片插入 Agent", role: "配图", brief: "给出架构图", directives: ["figure 占位"], riskFlags: [], status: "ok" },
          ],
          titleAngles: ["大神方法", "工作流差距"],
          openingOptions: ["从面试官问配置文件开场"],
          rhythmPlan: ["首屏冲突", "中段拆解", "结尾清单"],
          layoutDirectives: ["blockquote 强判断", "figure 占位"],
          imageBriefs: [{ role: "hero", prompt: "Codex 工作流首图", alt: "首图", caption: "工作流首图" }],
          collectibleChecklist: { title: "Codex 检查表", items: ["项目上下文", "验收命令"] },
          reviewRubric: ["无销售 CTA"],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          title: "OpenAI 大神教你如何榨干 Codex",
          deck: "差距不在会不会打开工具，而在工作流。",
          readerProfile: "想提升工程效率的后端工程师",
          coreClaim: "Codex 的上限来自上下文和验收闭环。",
          titleOptions: ["OpenAI 大神教你如何榨干 Codex"],
          bodyHtml:
            "<h1>OpenAI 大神教你如何榨干 Codex</h1><blockquote>Codex 的上限来自上下文和验收闭环。</blockquote><figure><figcaption>工作流首图</figcaption></figure><h2>可收藏清单</h2><ul><li>项目上下文</li></ul>",
          editorialScore: {
            total: 86,
            topic: 88,
            readerFit: 86,
            opening: 85,
            viewpoint: 88,
            evidence: 82,
            pacing: 86,
            wechatReadability: 87,
            originality: 86,
            notes: ["策略一落地"],
            revisionPriority: [],
          },
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          score: 88,
          passed: true,
          factIssues: [],
          fakeSceneIssues: [],
          ctaIssues: [],
          styleIssues: [],
          compressionNotes: [],
          revisionSummary: "已按策略一补足清单和配图占位。",
          revisedDraft: {
            title: "OpenAI 大神教你如何榨干 Codex",
            deck: "差距不在会不会打开工具，而在工作流。",
            readerProfile: "想提升工程效率的后端工程师",
            coreClaim: "Codex 的上限来自上下文和验收闭环。",
            titleOptions: ["OpenAI 大神教你如何榨干 Codex"],
            bodyHtml:
              "<h1>OpenAI 大神教你如何榨干 Codex</h1><blockquote>Codex 的上限来自上下文和验收闭环。</blockquote><figure><figcaption>工作流首图</figcaption></figure><h2>可收藏清单</h2><ul><li>项目上下文</li></ul>",
            editorialScore: {
              total: 88,
              topic: 88,
              readerFit: 88,
              opening: 86,
              viewpoint: 90,
              evidence: 84,
              pacing: 88,
              wechatReadability: 90,
              originality: 88,
              notes: ["可发"],
              revisionPriority: [],
            },
          },
        }),
      );

    const result = await generateOriginalDraftFromTopic({
      topic: "OpenAI 大神教你如何榨干 Codex",
      articles: [article],
      structureRuns: [structureRun],
      strategyId: EDITORIAL_BOARD_STRATEGY_ID,
      settings,
      reviewSettings: createReviewAiSettings(settings),
      draftStore,
      modelClient,
    });

    expect(modelClient).toHaveBeenCalledTimes(4);
    expect(result.editorialBoardPlan?.strategyId).toBe(EDITORIAL_BOARD_STRATEGY_ID);
    expect(result.editorialBoardPlan?.collectibleChecklist.items).toContain("项目上下文");
    expect(result.originalDraft.bodyHtml).toContain("figure");
    expect(result.review.score).toBe(88);
    expect(draftStore.createDraft).toHaveBeenCalledWith(expect.objectContaining({ notes: expect.stringContaining("策略一：编辑部流水线") }));
  });

  it("parses draft JSON when the model leaves raw newlines inside HTML strings", () => {
    const parsed = parseOriginalDraftResponse(`{
      "title": "Harness 工程拆解",
      "deck": "别只看模型能力。",
      "readerProfile": "想转 Agent 的后端工程师",
      "coreClaim": "Agent 要上线，关键是失败后还能恢复。",
      "titleOptions": ["别只看模型能力", "Agent 要上线，先补 Harness"],
      "bodyHtml": "<h1>Harness 工程拆解</h1>
<p>真正难的是状态、工具和恢复闭环。</p>",
      "editorialScore": {
        "total": 81,
        "topic": 82,
        "readerFit": 80,
        "opening": 78,
        "viewpoint": 85,
        "evidence": 76,
        "pacing": 80,
        "wechatReadability": 82,
        "originality": 80,
        "notes": ["比技术文档更有读者入口"],
        "revisionPriority": ["继续补证据"]
      }
    }`);

    expect(parsed.title).toBe("Harness 工程拆解");
    expect(parsed.bodyHtml).toContain("恢复闭环");
    expect(parsed.readerProfile).toContain("后端工程师");
    expect(parsed.editorialScore?.total).toBe(81);
  });

  it("parses JSON when the model prepends thinking text", () => {
    const parsed = parseWritingStructureResponse(`<think>先判断文章结构，再输出严格 JSON。</think>
    \`\`\`json
    {
      "structure": {
        "titlePattern": "反常识判断 + 工程落点",
        "openingHook": "线上故障场景",
        "pressurePoint": "只会调模型无法上线",
        "ethicalRewrite": "用具体失败模式提醒风险",
        "technicalBackbone": ["状态管理", "工具权限", "可恢复执行"],
        "evidencePattern": ["事故复盘", "模块拆解"],
        "pacingPattern": "场景 -> 判断 -> 拆解 -> 建议",
        "reusableMoves": ["先给冲突判断", "再给工程框架"],
        "antiPatterns": ["卖课 CTA"]
      },
      "qualityScore": 84
    }`);

    expect(parsed.qualityScore).toBe(84);
    expect(parsed.structure.technicalBackbone).toContain("状态管理");
  });

  it("parses draft JSON wrapped by a model and repairs quotes in bodyHtml", () => {
    const parsed = parseOriginalDraftResponse(`{
      "draft": {
        "title": "Harness 不是模型问题",
        "deck": "让 Agent 稳定跑起来才是工程题。",
        "readerProfile": "做 Agent 的后端工程师",
        "coreClaim": "Harness 决定 Agent 能不能稳定做完任务。",
        "titleOptions": ["Harness 不是模型问题"],
        "bodyHtml": "<h1>Harness 不是模型问题</h1><p>Agent 开始随机"失忆"，这不是模型问题。</p>",
        "editorialScore": {
          "total": 82,
          "topic": 82,
          "readerFit": 80,
          "opening": 78,
          "viewpoint": 84,
          "evidence": 78,
          "pacing": 82,
          "wechatReadability": 84,
          "originality": 80,
          "notes": ["观点清楚"],
          "revisionPriority": ["补真实工程细节"]
        }
      }
    }`);

    expect(parsed.title).toBe("Harness 不是模型问题");
    expect(parsed.bodyHtml).toContain('随机"失忆"');
    expect(parsed.editorialScore?.total).toBe(82);
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
