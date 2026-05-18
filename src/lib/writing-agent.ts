import { z } from "zod";
import { callOpenAICompatible, stripHtml, type ModelClient, type ModelRequest } from "@/lib/analysis";
import { createId, nowIso } from "@/lib/ids";
import type {
  AiSettings,
  Article,
  LocalDraft,
  OriginalArticleDraft,
  SourceReuseWarning,
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

const originalDraftSchema = z.object({
  title: z.string().min(1),
  deck: z.string().default(""),
  bodyHtml: z.string().min(1),
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

export function createOriginalDraftRequest(input: {
  topic: string;
  articles: Article[];
  blueprint?: WritingBlueprint | null;
  structureRuns?: WritingStructureRun[];
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
          "你是一个面向 AI 从业者和想转 Agent 方向技术人的公众号主笔。",
          "你的任务是写原创文章，不洗稿、不复刻参考文章句子、不搬运标题套路。",
          "v1 只做纯内容：不要课程、社群、资料领取、加微信、训练营、成交暗示等销售 CTA。",
          "写作要克制、具体、有工程判断，避免恐吓式焦虑。",
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
          "bodyHtml: string，包含 h1/h2/p/ul/li/blockquote 等安全 HTML，不要脚本。",
          "",
          "强制结构：真实场景开头 -> 反常识判断 -> Agent 能力框架 -> 工程拆解 -> 项目/职业建议 -> 克制结尾。",
          "原创约束：参考文章只作为素材和结构来源，不得复刻来源文章的长句、段落、标题和销售表达。",
          "读者：AI 从业者、想转 Agent 的技术人、需要判断 Agent 能否落地的团队负责人。",
          "",
          "写作蓝图：",
          input.blueprint ? JSON.stringify(toBlueprintPrompt(input.blueprint)) : "没有指定蓝图，请使用默认结构。",
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
  draftStore: DraftStore;
  modelClient?: ModelClient;
}): Promise<{
  draft: LocalDraft;
  originalDraft: OriginalArticleDraft;
  warnings: SourceReuseWarning[];
}> {
  assertModelSettings(input.settings);
  const topic = input.topic.trim();
  if (!topic) {
    throw new Error("请输入选题");
  }
  if (input.articles.length === 0) {
    throw new Error("请至少选择一篇参考文章");
  }
  const request = createOriginalDraftRequest({
    topic,
    articles: input.articles,
    blueprint: input.blueprint,
    structureRuns: input.structureRuns,
    model: input.settings.model,
  });
  const originalDraft = parseOriginalDraftResponse(await (input.modelClient ?? callOpenAICompatible)(request, input.settings));
  const warnings = findSourceReuseWarnings(originalDraft.bodyHtml, input.articles);
  const draft = await input.draftStore.createDraft({
    title: originalDraft.title,
    body: originalDraft.bodyHtml,
    sourceAnalysisIds: [],
    exportFormat: "html",
  });
  return { draft, originalDraft, warnings };
}

export function parseOriginalDraftResponse(raw: unknown): OriginalArticleDraft {
  const value = typeof raw === "string" ? parseJsonString(raw) : raw;
  return originalDraftSchema.parse(normalizeOriginalDraftPayload(value));
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
  const withoutFence = value.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(withoutFence);
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

function normalizeOriginalDraftPayload(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  return {
    title: normalizeText(value.title),
    deck: normalizeText(value.deck),
    bodyHtml: normalizeText(value.bodyHtml),
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeText(item)).filter(Boolean);
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
