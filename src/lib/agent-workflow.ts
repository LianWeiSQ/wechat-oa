import { EDITORIAL_BOARD_AGENT_STRATEGY_ID, normalizeTargetChannel } from "@/lib/agent-store";
import type { ModelClient } from "@/lib/analysis";
import { createId, nowIso } from "@/lib/ids";
import {
  createReviewAiSettings,
  ensureWritingStructureRuns,
  generateOriginalDraftFromTopic,
} from "@/lib/writing-agent";
import type {
  AgentDraft,
  AgentRun,
  AgentRunStep,
  AgentStrategy,
  AiSettings,
  Article,
  ContentChannel,
  LocalDraft,
  WritingBlueprint,
  WritingStructureRun,
} from "@/lib/types";

type MaybePromise<T> = T | Promise<T>;

type WritingStore = {
  saveStructureRun(run: WritingStructureRun): MaybePromise<WritingStructureRun>;
  listStructureRuns(articleId?: string): MaybePromise<WritingStructureRun[]>;
  saveBlueprint(blueprint: WritingBlueprint): MaybePromise<WritingBlueprint>;
  getBlueprint(id: string): MaybePromise<WritingBlueprint | null>;
};

export async function generateAgentDraftPayload(input: {
  topic: string;
  articles: Article[];
  strategy: AgentStrategy;
  settings: AiSettings;
  writingStore: WritingStore;
  channel?: ContentChannel;
  modelClient?: ModelClient;
}): Promise<{
  draftInput: Omit<AgentDraft, "id" | "createdAt" | "updatedAt">;
  runInput: Omit<AgentRun, "id" | "createdAt">;
}> {
  const topic = input.topic.trim();
  if (!topic) {
    throw new Error("请输入选题");
  }
  if (input.articles.length === 0) {
    throw new Error("请至少选择一篇引用知识库文章");
  }

  const strategySnapshot = snapshotStrategy(input.strategy);
  const channel = normalizeTargetChannel(input.channel ?? strategySnapshot.targetChannel);
  const settings = applyStrategyModel(input.settings, strategySnapshot);
  const reviewSettings = createReviewAiSettings(settings);
  const structureRuns = await ensureWritingStructureRuns({
    articles: input.articles,
    settings: reviewSettings,
    writingStore: input.writingStore,
    modelClient: input.modelClient,
  });
  const strategyBlueprint = strategyToBlueprint(strategySnapshot, input.articles, settings);
  const generation = await generateOriginalDraftFromTopic({
    topic,
    articles: input.articles,
    channel,
    blueprint: strategyBlueprint,
    structureRuns,
    strategyId: strategySnapshot.id === EDITORIAL_BOARD_AGENT_STRATEGY_ID ? "editorial-board-v1" : "default",
    settings,
    reviewSettings,
    draftStore: createEphemeralDraftStore(channel, input.articles.map((article) => article.id)),
    modelClient: input.modelClient,
  });
  const finalDraft = generation.originalDraft;
  const steps = strategySnapshot.modules
    .filter((module) => module.enabled)
    .map<AgentRunStep>((module) => ({
      moduleId: module.id,
      moduleName: module.name,
      role: module.role,
      status: "ok",
      message: module.prompt || "已纳入本次生成约束",
      output: module.model ? `指定模型：${module.model}` : undefined,
    }));
  if (generation.editorialBoardPlan) {
    steps.push({
      moduleId: "editorial-board-plan",
      moduleName: "编辑部协作方案",
      role: "editor_in_chief",
      status: "ok",
      message: generation.editorialBoardPlan.editorInChiefBrief || generation.editorialBoardPlan.strategyName,
    });
  }

  const runInput: Omit<AgentRun, "id" | "createdAt"> = {
    agentDraftId: undefined,
    strategyId: strategySnapshot.id,
    strategySnapshot,
    topic,
    sourceArticleIds: input.articles.map((article) => article.id),
    status: "completed",
    steps,
    modelMetadata: {
      provider: settings.modelProvider || "openai-compatible",
      model: settings.model,
    },
    warnings: generation.warnings,
    error: "",
    finishedAt: nowIso(),
  };

  const draftInput: Omit<AgentDraft, "id" | "createdAt" | "updatedAt"> = {
    title: finalDraft.title,
    bodyHtml: finalDraft.bodyHtml,
    topic,
    targetChannel: channel,
    sourceArticleIds: input.articles.map((article) => article.id),
    strategyId: strategySnapshot.id,
    strategySnapshot,
    runId: undefined,
    review: generation.review,
    warnings: generation.warnings,
    status: generation.warnings.length > 0 ? "editing" : "generated",
    localDraftId: undefined,
    wechatMediaId: undefined,
    error: "",
  };

  return { draftInput, runInput };
}

function snapshotStrategy(strategy: AgentStrategy): AgentStrategy {
  return {
    ...strategy,
    modules: strategy.modules.map((module) => ({ ...module })),
  };
}

function applyStrategyModel(settings: AiSettings, strategy: AgentStrategy): AiSettings {
  const strategyModel = strategy.defaultModel.trim();
  if (!strategyModel) {
    return settings;
  }
  return {
    ...settings,
    model: strategyModel,
  };
}

function strategyToBlueprint(strategy: AgentStrategy, articles: Article[], settings: AiSettings): WritingBlueprint {
  const enabledModules = strategy.modules.filter((module) => module.enabled);
  const timestamp = nowIso();
  return {
    id: `strategy-blueprint-${strategy.id}`,
    name: strategy.name,
    sourceArticleIds: articles.map((article) => article.id),
    summary: [
      strategy.description,
      `本次必须按 Agent 策略模块执行；目标平台：${strategy.targetChannel === "xiaohongshu" ? "小红书" : "微信公众号"}。`,
    ]
      .filter(Boolean)
      .join("\n"),
    sectionPlan: enabledModules.map((module) => ({
      title: module.name,
      purpose: roleLabel(module.role),
      guidance: [
        module.prompt,
        module.model ? `该模块偏好模型：${module.model}。若当前运行链路不能拆分模型，也必须保留它的角色约束。` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    })),
    toneRules: [
      "像真正的技术公众号主编：克制、有判断、短段落、少套话。",
      "不洗稿、不复刻引用知识库文章的长句，不做课程、社群、资料领取或加微信 CTA。",
      "所有模块输出必须服务最终读者，不把 Agent 分工名称硬写成正文小标题。",
    ],
    bannedExpressions: [
      "再不学就晚了",
      "普通人最后的机会",
      "扫码领取资料",
      "加微信进群",
      "闭眼冲",
    ],
    modelMetadata: {
      provider: settings.modelProvider || "openai-compatible",
      model: settings.model,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createEphemeralDraftStore(channel: ContentChannel, articleIds: string[]) {
  return {
    async createDraft(input: Pick<LocalDraft, "title" | "body" | "sourceAnalysisIds" | "exportFormat">): Promise<LocalDraft> {
      const timestamp = nowIso();
      return {
        id: createId("ephemeral_draft"),
        title: input.title,
        body: input.body,
        sourceAnalysisIds: input.sourceAnalysisIds,
        sourceArticleIds: articleIds,
        contentChannel: channel,
        publishStatus: "draft",
        plannedPublishAt: "",
        publishedAt: "",
        queueOrder: 0,
        notes: "Agent 草稿池临时结果，未写入本地公众号管理。",
        exportFormat: input.exportFormat,
        wechatDraftStatus: "not_sent",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    },
  };
}

function roleLabel(role: AgentStrategy["modules"][number]["role"]): string {
  switch (role) {
    case "editor_in_chief":
      return "主编定调";
    case "technical_brief":
      return "技术骨架";
    case "opening":
      return "开头钩子";
    case "pacing":
      return "阅读节奏";
    case "layout":
      return "公众号排版";
    case "image":
      return "图片插入";
    case "checklist":
      return "可收藏清单";
    case "review":
      return "最终审稿";
    case "writer":
      return "正文写作";
    default:
      return "自定义模块";
  }
}
