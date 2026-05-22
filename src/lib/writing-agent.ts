import { z } from "zod";
import { callOpenAICompatible, stripHtml, type ModelClient, type ModelRequest } from "@/lib/analysis";
import { createId, nowIso } from "@/lib/ids";
import type {
  AiSettings,
  Article,
  DraftReview,
  LocalDraft,
  OriginalArticleDraft,
  SourceReuseWarning,
  WritingBlueprint,
  WritingStructureRun,
  WritingTechnicalBrief,
} from "@/lib/types";

type MaybePromise<T> = T | Promise<T>;

type WritingStore = {
  saveStructureRun(run: WritingStructureRun): MaybePromise<WritingStructureRun>;
  listStructureRuns(articleId?: string): MaybePromise<WritingStructureRun[]>;
  saveBlueprint(blueprint: WritingBlueprint): MaybePromise<WritingBlueprint>;
  getBlueprint(id: string): MaybePromise<WritingBlueprint | null>;
};

type DraftStore = {
  createDraft(input: Pick<LocalDraft, "title" | "body" | "sourceAnalysisIds" | "exportFormat">): MaybePromise<LocalDraft>;
};

const structureSchema = z.object({
  titlePattern: z.string().default(""),
  openingHook: z.string().default(""),
  pressurePoint: z.string().default(""),
  ethicalRewrite: z.string().default(""),
  technicalBackbone: z.array(z.string()).default([]),
  evidencePattern: z.array(z.string()).default([]),
  pacingPattern: z.string().default(""),
  reusableMoves: z.array(z.string()).default([]),
  antiPatterns: z.array(z.string()).default([]),
});

const structureResponseSchema = z.object({
  structure: structureSchema,
  qualityScore: z.number().min(0).max(100),
});

const blueprintResponseSchema = z.object({
  name: z.string().min(1),
  summary: z.string().default(""),
  sectionPlan: z
    .array(
      z.object({
        title: z.string().min(1),
        purpose: z.string().default(""),
        guidance: z.string().default(""),
      }),
    )
    .default([]),
  toneRules: z.array(z.string()).default([]),
  bannedExpressions: z.array(z.string()).default([]),
});

const technicalBriefResponseSchema = z.object({
  targetReader: z.string().default(""),
  topicJudgment: z.string().default(""),
  coreClaim: z.string().default(""),
  verifiedFacts: z.array(z.string()).default([]),
  sourceBoundaries: z.array(z.string()).default([]),
  sectionBrief: z
    .array(
      z.object({
        title: z.string().min(1),
        mustSay: z.array(z.string()).default([]),
        evidence: z.array(z.string()).default([]),
        avoid: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  riskFlags: z.array(z.string()).default([]),
  styleInstructions: z.array(z.string()).default([]),
});

const editorialScoreSchema = z.object({
  total: z.number().min(0).max(100),
  topic: z.number().min(0).max(100).default(0),
  readerFit: z.number().min(0).max(100).default(0),
  opening: z.number().min(0).max(100).default(0),
  viewpoint: z.number().min(0).max(100).default(0),
  evidence: z.number().min(0).max(100).default(0),
  pacing: z.number().min(0).max(100).default(0),
  wechatReadability: z.number().min(0).max(100).default(0),
  originality: z.number().min(0).max(100).default(0),
  notes: z.array(z.string()).default([]),
  revisionPriority: z.array(z.string()).default([]),
});

const originalDraftSchema = z.object({
  title: z.string().min(1),
  deck: z.string().default(""),
  bodyHtml: z.string().min(1),
  readerProfile: z.string().optional(),
  coreClaim: z.string().optional(),
  titleOptions: z.array(z.string()).optional(),
  editorialScore: editorialScoreSchema.optional(),
});

const draftReviewResponseSchema = z.object({
  score: z.number().min(0).max(100),
  passed: z.boolean().default(false),
  factIssues: z.array(z.string()).default([]),
  fakeSceneIssues: z.array(z.string()).default([]),
  ctaIssues: z.array(z.string()).default([]),
  styleIssues: z.array(z.string()).default([]),
  compressionNotes: z.array(z.string()).default([]),
  revisionSummary: z.string().default(""),
  revisedDraft: originalDraftSchema.optional(),
});

export function createWritingStructureRequest(article: Article, model: string): ModelRequest {
  return {
    model,
    temperature: 0.25,
    max_output_tokens: 2200,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "你是公众号写作结构拆解 Agent，任务是把文章拆成可复用的结构资产。",
          "必须识别焦虑制造手法，并给出更克制、更真实的焦虑改写。",
          "必须提取技术骨架、证据方式、段落节奏和可复用写法。",
          "必须标出低质焦虑、标题党、卖课式转化等应避免表达，禁用销售 CTA。",
          "只输出 JSON，不要 Markdown，不要解释 JSON 外的内容。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "请拆解下面这篇文章的写作结构。",
          "",
          "返回 JSON 字段：",
          "structure: { titlePattern, openingHook, pressurePoint, ethicalRewrite, technicalBackbone[], evidencePattern[], pacingPattern, reusableMoves[], antiPatterns[] }",
          "qualityScore: 0-100，评估它作为写作结构样本的可复用程度。",
          "",
          "拆解重点：",
          "1. 不总结正文知识点，而是拆它怎么写。",
          "2. 把制造焦虑的地方改写成有证据、有出口的清醒表达。",
          "3. 技术骨架要能服务 Agent/AI 从业者原创文章。",
          "4. 反复提醒：后续生成文章不能洗稿，不能复刻原文句子，不能输出销售 CTA。",
          "",
          `标题：${article.title}`,
          `来源：${article.sourceName}`,
          `分类：${article.category}`,
          `正文：${article.contentText.slice(0, 12000)}`,
        ].join("\n"),
      },
    ],
  };
}

export async function analyzeWritingStructure(
  article: Article,
  settings: AiSettings,
  modelClient: ModelClient = callOpenAICompatible,
): Promise<WritingStructureRun> {
  assertModelSettings(settings);
  const request = createWritingStructureRequest(article, settings.model);
  const parsed = parseWritingStructureResponse(await modelClient(request, settings));
  return {
    id: createId("wstruct"),
    articleId: article.id,
    structure: parsed.structure,
    qualityScore: parsed.qualityScore,
    modelMetadata: {
      provider: settings.modelProvider || "openai-compatible",
      model: settings.model,
    },
    createdAt: nowIso(),
  };
}

export function parseWritingStructureResponse(raw: unknown): Pick<WritingStructureRun, "structure" | "qualityScore"> {
  const value = typeof raw === "string" ? parseJsonString(raw) : raw;
  const parsed = structureResponseSchema.parse(normalizeStructurePayload(value));
  return parsed;
}

export async function ensureWritingStructureRuns(input: {
  articles: Article[];
  settings: AiSettings;
  writingStore: WritingStore;
  modelClient?: ModelClient;
}): Promise<WritingStructureRun[]> {
  const result: WritingStructureRun[] = [];
  for (const article of uniqueArticles(input.articles)) {
    const existing = (await input.writingStore.listStructureRuns(article.id))[0];
    if (existing) {
      result.push(existing);
      continue;
    }
    const run = await analyzeWritingStructure(article, input.settings, input.modelClient);
    result.push(await input.writingStore.saveStructureRun(run));
  }
  return result;
}

export function createWritingBlueprintRequest(
  articles: Article[],
  structureRuns: WritingStructureRun[],
  model: string,
): ModelRequest {
  return {
    model,
    temperature: 0.3,
    max_output_tokens: 2200,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "你是 AI 技术公众号的主编，正在把多篇文章的写作结构归纳成可复用蓝图。",
          "蓝图只服务原创文章，不服务洗稿；必须禁止复刻来源文章句子。",
          "v1 是纯内容生产，不加入课程、社群、资料领取、加微信等销售 CTA。",
          "只输出 JSON，不要 Markdown。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "请基于这些单篇结构拆解，生成一个可复用的 WritingBlueprint。",
          "",
          "返回 JSON 字段：",
          "name: string",
          "summary: string",
          "sectionPlan: [{title, purpose, guidance}]，建议 5-7 节",
          "toneRules: string[]",
          "bannedExpressions: string[]",
          "",
          "默认文章骨架：真实场景开头 -> 反常识判断 -> Agent 能力框架 -> 工程拆解 -> 项目/职业建议 -> 克制结尾。",
          "要求：纯内容、克制、有技术判断、面向 AI 从业者或想转 Agent 的技术人。",
          "",
          "来源文章：",
          ...articles.map((article, index) => `${index + 1}. ${article.title}（${article.sourceName}，${article.category}）`),
          "",
          "结构拆解：",
          JSON.stringify(
            structureRuns.map((run) => ({
              articleId: run.articleId,
              qualityScore: run.qualityScore,
              structure: run.structure,
            })),
          ),
        ].join("\n"),
      },
    ],
  };
}

export async function generateWritingBlueprint(input: {
  articles: Article[];
  structureRuns: WritingStructureRun[];
  settings: AiSettings;
  writingStore?: Pick<WritingStore, "saveBlueprint">;
  modelClient?: ModelClient;
}): Promise<WritingBlueprint> {
  assertModelSettings(input.settings);
  const request = createWritingBlueprintRequest(input.articles, input.structureRuns, input.settings.model);
  const parsed = parseWritingBlueprintResponse(await (input.modelClient ?? callOpenAICompatible)(request, input.settings));
  const timestamp = nowIso();
  const blueprint: WritingBlueprint = {
    id: createId("wblue"),
    name: parsed.name,
    sourceArticleIds: uniqueArticles(input.articles).map((article) => article.id),
    summary: parsed.summary,
    sectionPlan: ensureDefaultSections(parsed.sectionPlan),
    toneRules: ensureDefaultToneRules(parsed.toneRules),
    bannedExpressions: ensureDefaultBannedExpressions(parsed.bannedExpressions),
    modelMetadata: {
      provider: input.settings.modelProvider || "openai-compatible",
      model: input.settings.model,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return input.writingStore ? await input.writingStore.saveBlueprint(blueprint) : blueprint;
}

export function parseWritingBlueprintResponse(raw: unknown): Omit<WritingBlueprint, "id" | "sourceArticleIds" | "modelMetadata" | "createdAt" | "updatedAt"> {
  const value = typeof raw === "string" ? parseJsonString(raw) : raw;
  return blueprintResponseSchema.parse(normalizeBlueprintPayload(value));
}

export function createReviewAiSettings(settings: AiSettings): AiSettings {
  return {
    ...settings,
    modelProvider: settings.reviewModelProvider || settings.modelProvider,
    baseUrl: settings.reviewBaseUrl || settings.baseUrl,
    apiKey: settings.reviewApiKey || settings.apiKey,
    model: settings.reviewModel?.trim() || settings.model,
    wireApi: settings.reviewWireApi || settings.wireApi,
    reasoningEffort: settings.reviewReasoningEffort || settings.reasoningEffort,
  };
}

export function createTechnicalBriefRequest(input: {
  topic: string;
  articles: Article[];
  blueprint?: WritingBlueprint | null;
  structureRuns?: WritingStructureRun[];
  model: string;
}): ModelRequest {
  return {
    model: input.model,
    temperature: 0.18,
    max_output_tokens: 2600,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "你是 Agent 技术文章的技术骨架 Agent，由偏工程严谨的模型承担。",
          "你的任务是给公众号写手提供事实边界、工程因果链和章节骨架，不负责写成公众号正文。",
          "必须区分：可由参考文章支撑的事实、合理推论、不能写死的源码路径或数据。",
          "禁止编造事故、朋友故事、源码路径、性能数字；不输出销售 CTA。",
          "只输出 JSON，不要 Markdown，不要解释 JSON 外的内容。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `选题：${input.topic}`,
          "",
          "请生成技术写作骨架 JSON：",
          "targetReader: string，选择一个最核心读者。",
          "topicJudgment: string，说明这个选题为什么值得写、普通科普和本文差异是什么。",
          "coreClaim: string，一句话主张。",
          "verifiedFacts: string[]，只列参考文章可支撑的事实或术语。",
          "sourceBoundaries: string[]，哪些说法不能写死，哪些需要人工核验。",
          "sectionBrief: [{title, mustSay[], evidence[], avoid[]}]，5-7 节，每节告诉写手必须讲什么、证据是什么、避免什么。",
          "riskFlags: string[]，事实风险、洗稿风险、虚假场景风险。",
          "styleInstructions: string[]，给公众号改写模型的克制表达要求。",
          "",
          "写作蓝图：",
          input.blueprint ? JSON.stringify(toBlueprintPrompt(input.blueprint)) : "没有指定蓝图，请使用默认结构。",
          "",
          "参考结构资产：",
          JSON.stringify(
            (input.structureRuns ?? []).map((run) => ({
              articleId: run.articleId,
              qualityScore: run.qualityScore,
              structure: run.structure,
            })),
          ),
          "",
          "参考文章：",
          ...input.articles.map((article, index) =>
            [
              `${index + 1}. ${article.title}`,
              `articleId: ${article.id}`,
              `来源：${article.sourceName}`,
              `分类：${article.category}`,
              `正文摘录：${clipText(article.contentText, 1400)}`,
            ].join("\n"),
          ),
        ].join("\n"),
      },
    ],
  };
}

export function parseTechnicalBriefResponse(raw: unknown): WritingTechnicalBrief {
  const value = typeof raw === "string" ? parseJsonString(raw) : raw;
  return technicalBriefResponseSchema.parse(normalizeTechnicalBriefPayload(value));
}

export function createOriginalDraftRequest(input: {
  topic: string;
  articles: Article[];
  blueprint?: WritingBlueprint | null;
  structureRuns?: WritingStructureRun[];
  technicalBrief?: WritingTechnicalBrief;
  model: string;
}): ModelRequest {
  return {
    model: input.model,
    temperature: 0.42,
    max_output_tokens: 4200,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "你是一个面向 AI 从业者和想转 Agent 方向技术人的公众号主笔兼主编。",
          "你的任务不是写技术文档，而是写一篇真的有人愿意点开、读完、收藏的原创公众号文章。",
          "写作前必须完成：选题判断、读者画像、强观点提炼、真实场景开头、标题候选、证据组织、公众号节奏控制和发布前自评。",
          "你必须服从技术骨架 Agent 给出的事实边界；它没确认的源码路径、性能数字、真实事故，不要写死。",
          "你的任务是写原创文章，不洗稿、不复刻参考文章句子、不搬运标题套路，也不要编造不存在的源码路径或数据。",
          "v1 只做纯内容：不要课程、社群、资料领取、加微信、训练营、成交暗示等销售 CTA。",
          "写作要克制、具体、有工程判断，避免恐吓式焦虑；可以有作者判断，但不能空喊口号。",
          "文章要有公众号手感：短段落、信息量小标题、人的观察、强判断、适度留白；不要写成一二三四式培训课件。",
          "输出必须能被 JSON.parse 直接解析；bodyHtml 字符串内不要使用未转义的英文双引号，正文引用请用中文引号或 &quot;。",
          "只输出 JSON，不要 Markdown，不要解释 JSON 外的内容。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `选题：${input.topic}`,
          "",
          "请生成一篇可进入微信公众号草稿箱的原创技术文章。",
          "",
          "必须返回 JSON 字段：",
          "title: string",
          "deck: string",
          "readerProfile: string，明确这篇写给谁，以及为什么他会读。",
          "coreClaim: string，用一句话写出全文最该被记住的判断。",
          "titleOptions: string[]，给 5 个公众号标题候选，最后 title 选择其中最强的一个或它的优化版。",
          "bodyHtml: string，包含 h1/h2/p/ul/li/blockquote 等安全 HTML，不要脚本。",
          "editorialScore: { total, topic, readerFit, opening, viewpoint, evidence, pacing, wechatReadability, originality, notes[], revisionPriority[] }，按公众号发布标准自评 0-100。",
          "",
          "生成前的隐含工作流：",
          "1. 选题判断：明确读者痛点、当下性、点击理由，以及和普通 Harness 科普的差异。",
          "2. 读者画像：在 AI 从业者、想转 Agent 的后端工程师、Agent 平台 Tech Lead、面试准备者中选择一个主读者，不要同时讨好所有人。",
          "3. 强观点：全文必须有 2-3 句可被读者记住的判断，避免百科腔。",
          "4. 真实场景：开头要像一个工程师读源码/做项目后的真实判断，不要用像 AI 编出来的假事故。",
          "5. 标题/开头：标题要有冲突或收益；前 300 字必须说明为什么现在值得读。",
          "6. 节奏：每个 h2 都要有信息量，不要使用“核心机制工程拆解”这类泛标题；每段尽量短。",
          "7. 证据：可以引用参考文章里的设计对象和结构资产，但要讲因果关系，不要堆路径，不确定的源码路径不要写死。",
          "8. 主编重写：如果初稿像技术文档、AI 味重、开头弱、标题不够公众号，请先自我重写后再输出最终 JSON。",
          "9. 质检：自评低于 75 分时必须继续重写；最终 editorialScore 要诚实，不能虚高。",
          "",
          "推荐结构：真实工程观察开头 -> 反常识判断 -> 用读者熟悉的失败模式解释 Harness -> 拆 3 个关键机制 -> 给项目/面试可用框架 -> 克制结尾。",
          "原创约束：参考文章只作为素材和结构来源，不得复刻来源文章的长句、段落、标题和销售表达。",
          "默认作者声音：懂工程、克制、有判断，不卖焦虑；可以写“我更愿意把它理解为...”“这不是概念洁癖，而是线上故障迟早会撞到的边界”。",
          "",
          "写作蓝图：",
          input.blueprint ? JSON.stringify(toBlueprintPrompt(input.blueprint)) : "没有指定蓝图，请使用默认结构。",
          "",
          "技术骨架 Agent 输出：",
          input.technicalBrief ? JSON.stringify(input.technicalBrief) : "没有技术骨架，请自行保持事实克制。",
          "",
          "参考结构资产：",
          JSON.stringify(
            (input.structureRuns ?? []).map((run) => ({
              articleId: run.articleId,
              structure: run.structure,
            })),
          ),
          "",
          "参考文章摘要：",
          ...input.articles.map((article, index) =>
            [
              `${index + 1}. ${article.title}`,
              `来源：${article.sourceName}`,
              `分类：${article.category}`,
              `摘要素材：${clipText(article.contentText, 900)}`,
            ].join("\n"),
          ),
        ].join("\n"),
      },
    ],
  };
}

export async function generateOriginalDraftFromTopic(input: {
  topic: string;
  articles: Article[];
  blueprint?: WritingBlueprint | null;
  structureRuns?: WritingStructureRun[];
  settings: AiSettings;
  reviewSettings?: AiSettings;
  draftStore: DraftStore;
  modelClient?: ModelClient;
}): Promise<{
  draft: LocalDraft;
  originalDraft: OriginalArticleDraft;
  draftBeforeReview: OriginalArticleDraft;
  technicalBrief: WritingTechnicalBrief;
  review: DraftReview;
  warnings: SourceReuseWarning[];
}> {
  assertModelSettings(input.settings);
  const reviewSettings = input.reviewSettings ?? createReviewAiSettings(input.settings);
  assertModelSettings(reviewSettings);
  const topic = input.topic.trim();
  if (!topic) {
    throw new Error("请输入选题");
  }
  if (input.articles.length === 0) {
    throw new Error("请至少选择一篇参考文章");
  }
  const modelClient = input.modelClient ?? callOpenAICompatible;
  const technicalBrief = await generateTechnicalBrief({
    topic,
    articles: input.articles,
    blueprint: input.blueprint,
    structureRuns: input.structureRuns,
    settings: reviewSettings,
    modelClient,
  });
  const request = createOriginalDraftRequest({
    topic,
    articles: input.articles,
    blueprint: input.blueprint,
    structureRuns: input.structureRuns,
    technicalBrief,
    model: input.settings.model,
  });
  const draftBeforeReview = parseOriginalDraftResponse(await modelClient(request, input.settings));
  const review = await reviewAndReviseDraft({
    topic,
    articles: input.articles,
    technicalBrief,
    draft: draftBeforeReview,
    settings: reviewSettings,
    modelClient,
  });
  const originalDraft = review.revisedDraft ?? draftBeforeReview;
  const warnings = findSourceReuseWarnings(originalDraft.bodyHtml, input.articles);
  const draft = await input.draftStore.createDraft({
    title: originalDraft.title,
    body: originalDraft.bodyHtml,
    sourceAnalysisIds: [],
    exportFormat: "html",
  });
  return { draft, originalDraft, draftBeforeReview, technicalBrief, review, warnings };
}

export async function generateTechnicalBrief(input: {
  topic: string;
  articles: Article[];
  blueprint?: WritingBlueprint | null;
  structureRuns?: WritingStructureRun[];
  settings: AiSettings;
  modelClient?: ModelClient;
}): Promise<WritingTechnicalBrief> {
  assertModelSettings(input.settings);
  const request = createTechnicalBriefRequest({
    topic: input.topic,
    articles: input.articles,
    blueprint: input.blueprint,
    structureRuns: input.structureRuns,
    model: input.settings.model,
  });
  return parseTechnicalBriefResponse(await (input.modelClient ?? callOpenAICompatible)(request, input.settings));
}

export function createDraftReviewRequest(input: {
  topic: string;
  articles: Article[];
  technicalBrief: WritingTechnicalBrief;
  draft: OriginalArticleDraft;
  model: string;
}): ModelRequest {
  return {
    model: input.model,
    temperature: 0.12,
    max_output_tokens: 3600,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "你是技术公众号的审稿 Agent，负责事实核验、删虚假场景、删 CTA、压缩废话并给出最终可发稿。",
          "审稿必须严格：不确定的源码路径、数据、具体事故、朋友案例要删除或改成克制表述。",
          "禁止课程、社群、资料领取、加微信、保持关注等转化 CTA。",
          "如果文章像技术文档，要改成公众号可读；如果文章像营销文，要改成工程判断。",
          "只输出 JSON，不要 Markdown，不要解释 JSON 外的内容。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `选题：${input.topic}`,
          "",
          "请审稿并输出 JSON：",
          "score: 0-100，最终可读性和可信度评分。",
          "passed: boolean，是否可以直接发布。",
          "factIssues: string[]，事实/源码/数据风险。",
          "fakeSceneIssues: string[]，疑似编造场景或过度具体案例。",
          "ctaIssues: string[]，销售/关注/引流问题。",
          "styleIssues: string[]，AI味、文档味、废话、标题问题。",
          "compressionNotes: string[]，删改了哪些冗余表达。",
          "revisionSummary: string，简述修订策略。",
          "revisedDraft: { title, deck, readerProfile, coreClaim, titleOptions[], bodyHtml, editorialScore }，必须给出最终修订稿。",
          "",
          "技术骨架：",
          JSON.stringify(input.technicalBrief),
          "",
          "待审稿：",
          JSON.stringify(input.draft),
          "",
          "参考文章摘要：",
          ...input.articles.map((article, index) =>
            [
              `${index + 1}. ${article.title}`,
              `articleId: ${article.id}`,
              `来源：${article.sourceName}`,
              `摘要素材：${clipText(article.contentText, 1200)}`,
            ].join("\n"),
          ),
        ].join("\n"),
      },
    ],
  };
}

export async function reviewAndReviseDraft(input: {
  topic: string;
  articles: Article[];
  technicalBrief: WritingTechnicalBrief;
  draft: OriginalArticleDraft;
  settings: AiSettings;
  modelClient?: ModelClient;
}): Promise<DraftReview> {
  assertModelSettings(input.settings);
  const request = createDraftReviewRequest({
    topic: input.topic,
    articles: input.articles,
    technicalBrief: input.technicalBrief,
    draft: input.draft,
    model: input.settings.model,
  });
  return parseDraftReviewResponse(await (input.modelClient ?? callOpenAICompatible)(request, input.settings), input.draft);
}

export function parseOriginalDraftResponse(raw: unknown): OriginalArticleDraft {
  const value = typeof raw === "string" ? parseJsonString(raw) : raw;
  return originalDraftSchema.parse(normalizeOriginalDraftPayload(unwrapOriginalDraftPayload(value)));
}

export function parseDraftReviewResponse(raw: unknown, fallbackDraft?: OriginalArticleDraft): DraftReview {
  const value = typeof raw === "string" ? parseJsonString(raw) : raw;
  const parsed = draftReviewResponseSchema.parse(normalizeDraftReviewPayload(value));
  return {
    ...parsed,
    revisedDraft: parsed.revisedDraft ?? fallbackDraft,
  };
}

export function findSourceReuseWarnings(
  draftHtml: string,
  articles: Article[],
  minChars = 42,
): SourceReuseWarning[] {
  const draftText = normalizeComparableText(stripHtml(draftHtml));
  if (!draftText) {
    return [];
  }

  const warnings: SourceReuseWarning[] = [];
  const seen = new Set<string>();
  for (const article of articles) {
    const candidates = extractReusableSourceSentences(article.contentText, minChars);
    for (const candidate of candidates) {
      const normalized = normalizeComparableText(candidate);
      if (normalized.length < minChars || !draftText.includes(normalized)) {
        continue;
      }
      const key = `${article.id}:${normalized}`;
      if (seen.has(key)) {
        continue;
      }
      warnings.push({
        sourceArticleId: article.id,
        sourceTitle: article.title,
        matchedText: candidate,
      });
      seen.add(key);
      if (warnings.length >= 5) {
        return warnings;
      }
    }
  }
  return warnings;
}

function assertModelSettings(settings: AiSettings): void {
  if (!settings.apiKey.trim()) {
    throw new Error("请先配置 OpenAI-compatible API Key");
  }
  if (!settings.model.trim()) {
    throw new Error("请先配置模型名称");
  }
}

function parseJsonString(value: string): unknown {
  const cleaned = stripJsonNoise(value);
  const parsed = tryParseJson(cleaned);
  if (parsed.ok) {
    return parsed.value;
  }

  for (const candidate of extractJsonObjectCandidates(cleaned)) {
    const candidateParsed = tryParseJson(candidate);
    if (candidateParsed.ok) {
      return candidateParsed.value;
    }
  }

  throw parsed.error;
}

function stripJsonNoise(value: string): string {
  return value
    .trim()
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function tryParseJson(value: string): { ok: true; value: unknown } | { ok: false; error: unknown } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch (error) {
    try {
      return { ok: true, value: JSON.parse(escapeControlCharactersInJsonStrings(value)) };
    } catch {
      const repaired = repairKnownJsonStringFields(value);
      try {
        return { ok: true, value: JSON.parse(escapeControlCharactersInJsonStrings(repaired)) };
      } catch {
        return { ok: false, error };
      }
    }
  }
}

function repairKnownJsonStringFields(value: string): string {
  return repairJsonStringFieldBeforeNextKey(value, "bodyHtml", [
    "editorialScore",
    "readerProfile",
    "coreClaim",
    "titleOptions",
  ]);
}

function repairJsonStringFieldBeforeNextKey(value: string, field: string, nextKeys: string[]): string {
  const fieldPattern = new RegExp(`("${field}"\\s*:\\s*)"`);
  const fieldMatch = fieldPattern.exec(value);
  if (!fieldMatch) {
    return value;
  }
  const contentStart = fieldMatch.index + fieldMatch[0].length;
  const rest = value.slice(contentStart);
  const nextKeyPattern = new RegExp(`"\\s*,\\s*"(${nextKeys.join("|")})"\\s*:`);
  const nextKeyMatch = nextKeyPattern.exec(rest);
  if (!nextKeyMatch) {
    return value;
  }
  const contentEnd = contentStart + nextKeyMatch.index;
  const content = value.slice(contentStart, contentEnd);
  const escapedContent = content.replace(/(?<!\\)"/g, '\\"');
  return `${value.slice(0, contentStart)}${escapedContent}${value.slice(contentEnd)}`;
}

function extractJsonObjectCandidates(value: string): string[] {
  const candidates: string[] = [];
  for (let start = 0; start < value.length; start += 1) {
    if (value[start] !== "{") {
      continue;
    }
    const end = findJsonObjectEnd(value, start);
    if (end !== -1) {
      candidates.push(value.slice(start, end + 1));
    }
  }
  return candidates;
}

function findJsonObjectEnd(value: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function escapeControlCharactersInJsonStrings(value: string): string {
  let output = "";
  let inString = false;
  let escaped = false;

  for (const char of value) {
    if (!inString) {
      output += char;
      if (char === '"') {
        inString = true;
      }
      continue;
    }

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      output += char;
      inString = false;
      continue;
    }

    switch (char) {
      case "\n":
        output += "\\n";
        break;
      case "\r":
        output += "\\r";
        break;
      case "\t":
        output += "\\t";
        break;
      case "\b":
        output += "\\b";
        break;
      case "\f":
        output += "\\f";
        break;
      default:
        output += char.charCodeAt(0) < 0x20 ? `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}` : char;
    }
  }

  return output;
}

function normalizeStructurePayload(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const rawStructure = isRecord(value.structure) ? value.structure : value;
  return {
    structure: {
      titlePattern: normalizeText(rawStructure.titlePattern),
      openingHook: normalizeText(rawStructure.openingHook),
      pressurePoint: normalizeText(rawStructure.pressurePoint),
      ethicalRewrite: normalizeText(rawStructure.ethicalRewrite),
      technicalBackbone: normalizeStringArray(rawStructure.technicalBackbone),
      evidencePattern: normalizeStringArray(rawStructure.evidencePattern),
      pacingPattern: normalizeText(rawStructure.pacingPattern),
      reusableMoves: normalizeStringArray(rawStructure.reusableMoves),
      antiPatterns: normalizeStringArray(rawStructure.antiPatterns),
    },
    qualityScore: normalizeScore(value.qualityScore),
  };
}

function normalizeBlueprintPayload(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  return {
    name: normalizeText(value.name),
    summary: normalizeText(value.summary),
    sectionPlan: Array.isArray(value.sectionPlan)
      ? value.sectionPlan.map((section) => {
          if (!isRecord(section)) {
            return { title: normalizeText(section), purpose: "", guidance: "" };
          }
          return {
            title: normalizeText(section.title),
            purpose: normalizeText(section.purpose),
            guidance: normalizeText(section.guidance),
          };
        })
      : [],
    toneRules: normalizeStringArray(value.toneRules),
    bannedExpressions: normalizeStringArray(value.bannedExpressions),
  };
}

function normalizeTechnicalBriefPayload(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const sectionBrief = pickValue(value, ["sectionBrief", "sections", "sectionPlan", "章节骨架", "章节计划"]);
  return {
    targetReader: normalizeText(pickValue(value, ["targetReader", "target_reader", "readerProfile", "目标读者", "读者画像"])),
    topicJudgment: normalizeText(pickValue(value, ["topicJudgment", "topic_judgment", "topic", "选题判断", "选题价值"])),
    coreClaim: normalizeText(pickValue(value, ["coreClaim", "core_claim", "claim", "核心观点", "核心判断", "主张"])),
    verifiedFacts: normalizeStringArray(pickValue(value, ["verifiedFacts", "verified_facts", "facts", "可验证事实", "事实依据"])),
    sourceBoundaries: normalizeStringArray(pickValue(value, ["sourceBoundaries", "source_boundaries", "boundaries", "事实边界", "边界"])),
    sectionBrief: Array.isArray(sectionBrief)
      ? sectionBrief.map((section) => {
          if (!isRecord(section)) {
            return { title: normalizeText(section), mustSay: [], evidence: [], avoid: [] };
          }
          return {
            title: normalizeText(pickValue(section, ["title", "heading", "标题"])),
            mustSay: normalizeStringArray(pickValue(section, ["mustSay", "must_say", "points", "must", "必须讲", "要点"])),
            evidence: normalizeStringArray(pickValue(section, ["evidence", "sources", "证据"])),
            avoid: normalizeStringArray(pickValue(section, ["avoid", "risks", "避免"])),
          };
        })
      : [],
    riskFlags: normalizeStringArray(pickValue(value, ["riskFlags", "risk_flags", "risks", "风险"])),
    styleInstructions: normalizeStringArray(pickValue(value, ["styleInstructions", "style_instructions", "writingInstructions", "表达要求"])),
  };
}

function normalizeOriginalDraftPayload(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  return {
    title: normalizeText(value.title),
    deck: normalizeText(value.deck),
    bodyHtml: normalizeText(value.bodyHtml),
    readerProfile: normalizeText(value.readerProfile),
    coreClaim: normalizeText(value.coreClaim),
    titleOptions: normalizeStringArray(value.titleOptions),
    editorialScore: normalizeEditorialScore(value.editorialScore),
  };
}

function unwrapOriginalDraftPayload(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  if (hasOriginalDraftShape(value)) {
    return value;
  }
  for (const key of ["draft", "article", "result", "data", "output"]) {
    const nested = value[key];
    if (isRecord(nested) && hasOriginalDraftShape(nested)) {
      return nested;
    }
  }
  return value;
}

function hasOriginalDraftShape(value: Record<string, unknown>): boolean {
  return typeof value.title === "string" || typeof value.bodyHtml === "string";
}

function normalizeDraftReviewPayload(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const rawReview = unwrapDraftReviewPayload(value);
  if (!isRecord(rawReview)) {
    return rawReview;
  }
  const rawDraft = unwrapOriginalDraftPayload(rawReview.revisedDraft ?? rawReview.draft ?? rawReview.article);
  return {
    score: normalizeScore(rawReview.score ?? rawReview.total ?? rawReview.reviewScore),
    passed: normalizeBooleanish(rawReview.passed),
    factIssues: normalizeStringArray(rawReview.factIssues),
    fakeSceneIssues: normalizeStringArray(rawReview.fakeSceneIssues),
    ctaIssues: normalizeStringArray(rawReview.ctaIssues),
    styleIssues: normalizeStringArray(rawReview.styleIssues),
    compressionNotes: normalizeStringArray(rawReview.compressionNotes),
    revisionSummary: normalizeText(rawReview.revisionSummary),
    revisedDraft: isRecord(rawDraft) && hasOriginalDraftShape(rawDraft) ? normalizeOriginalDraftPayload(rawDraft) : undefined,
  };
}

function unwrapDraftReviewPayload(value: Record<string, unknown>): unknown {
  if (typeof value.score === "number" || typeof value.score === "string" || value.revisedDraft) {
    return value;
  }
  for (const key of ["review", "result", "data", "output"]) {
    const nested = value[key];
    if (isRecord(nested)) {
      return nested;
    }
  }
  return value;
}

function normalizeEditorialScore(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    total: normalizeScore(value.total),
    topic: normalizeScore(value.topic),
    readerFit: normalizeScore(value.readerFit),
    opening: normalizeScore(value.opening),
    viewpoint: normalizeScore(value.viewpoint),
    evidence: normalizeScore(value.evidence),
    pacing: normalizeScore(value.pacing),
    wechatReadability: normalizeScore(value.wechatReadability),
    originality: normalizeScore(value.originality),
    notes: normalizeStringArray(value.notes),
    revisionPriority: normalizeStringArray(value.revisionPriority),
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function pickValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

function normalizeText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean).join("；");
  }
  if (isRecord(value)) {
    return Object.values(value).map((item) => normalizeText(item)).filter(Boolean).join("；");
  }
  return "";
}

function normalizeScore(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0;
}

function normalizeBooleanish(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return ["1", "true", "yes", "pass", "passed", "ok", "通过"].includes(value.trim().toLowerCase());
  }
  return false;
}

function ensureDefaultSections(sections: WritingBlueprint["sectionPlan"]): WritingBlueprint["sectionPlan"] {
  if (sections.length > 0) {
    return sections.slice(0, 8);
  }
  return [
    { title: "真实场景", purpose: "让读者看到具体工作现场", guidance: "用项目、面试或团队落地卡点开头。" },
    { title: "反常识判断", purpose: "建立文章主张", guidance: "指出真正难点不是模型本身，而是工程闭环。" },
    { title: "能力框架", purpose: "给转型读者抓手", guidance: "拆成任务拆解、工具、状态、权限、评估等模块。" },
    { title: "工程拆解", purpose: "建立可信度", guidance: "讲约束、失败模式、指标和取舍。" },
    { title: "行动建议", purpose: "给读者下一步", guidance: "给项目练习或判断清单，不做销售转化。" },
  ];
}

function ensureDefaultToneRules(rules: string[]): string[] {
  return rules.length > 0
    ? rules
    : ["克制、具体、有工程判断", "压力表达必须给证据和解决路径", "面向 AI 从业者和想转 Agent 的技术人"];
}

function ensureDefaultBannedExpressions(expressions: string[]): string[] {
  return Array.from(new Set([...expressions, "再不学就淘汰", "逆天改命", "加微信领取", "训练营报名", "课程优惠"]));
}

function toBlueprintPrompt(blueprint: WritingBlueprint) {
  return {
    name: blueprint.name,
    summary: blueprint.summary,
    sectionPlan: blueprint.sectionPlan,
    toneRules: blueprint.toneRules,
    bannedExpressions: blueprint.bannedExpressions,
  };
}

function uniqueArticles(articles: Article[]): Article[] {
  const seen = new Set<string>();
  return articles.filter((article) => {
    if (seen.has(article.id)) {
      return false;
    }
    seen.add(article.id);
    return true;
  });
}

function clipText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function normalizeComparableText(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function extractReusableSourceSentences(value: string, minChars: number): string[] {
  const compact = value.replace(/\s+/g, " ").trim();
  const sentences = compact.match(/[^。！？!?；;]{20,180}[。！？!?；;]?/g) ?? [];
  return sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => normalizeComparableText(sentence).length >= minChars)
    .slice(0, 260);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
