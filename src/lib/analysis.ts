import { z } from "zod";
import { createId, nowIso } from "@/lib/ids";
import type { AiSettings, AnalysisRun, AnalysisTemplate, Article, TopicCandidate, ViralScore } from "@/lib/types";

export const ANALYSIS_TEMPLATES: AnalysisTemplate[] = [
  {
    id: "technical-deep-dive",
    name: "技术深挖",
    lens: "硬核技术读者",
    enabled: true,
    prompt:
      "用硬核技术视角拆解文章，聚焦模型能力边界、系统架构、评测方法、工程成本和技术风险。",
    scoringRubric: ["痛点强度", "技术稀缺性", "证据密度", "争议空间"],
  },
  {
    id: "consulting",
    name: "咨询视角",
    lens: "企业 AI 咨询",
    enabled: true,
    prompt:
      "用 AI 咨询视角拆解文章，聚焦业务问题、落地路径、ROI、客户疑问和咨询切入点。",
    scoringRubric: ["客户痛点", "落地价值", "可销售性", "决策紧迫度"],
  },
  {
    id: "media",
    name: "媒体视角",
    lens: "传播与叙事",
    enabled: true,
    prompt:
      "用公众号爆款编辑视角拆解文章，聚焦标题套路、开头张力、叙事结构、传播金句和争议点。",
    scoringRubric: ["标题张力", "情绪钩子", "传播性", "讨论度"],
  },
  {
    id: "executive",
    name: "老板能懂版",
    lens: "企业/创业者决策",
    enabled: true,
    prompt:
      "用非技术决策者能理解的方式拆解文章，聚焦机会、风险、成本、组织能力和下一步行动。",
    scoringRubric: ["决策价值", "表达清晰度", "风险提示", "行动建议"],
  },
];

export type ModelRequest = {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  response_format: { type: "json_object" };
  temperature: number;
  max_output_tokens?: number;
};

export type ModelClient = (request: ModelRequest, settings: AiSettings) => Promise<unknown>;

const responseSchema = z.object({
  summary: z.string(),
  technicalInsights: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  reusableAngles: z.array(z.string()).default([]),
  viralScore: z.object({
    total: z.number().min(0).max(100),
    dimensions: z.object({
      pain: z.number().min(0).max(25),
      novelty: z.number().min(0).max(25),
      evidence: z.number().min(0).max(25),
      debate: z.number().min(0).max(25),
    }),
    reasons: z.array(z.string()).min(1),
  }),
  topicCandidates: z.array(
    z.object({
      title: z.string(),
      hook: z.string(),
      targetReader: z.string(),
      angle: z.string(),
      viralScore: z.number().min(0).max(100),
    }),
  ),
});

export async function analyzeArticle(
  article: Article,
  template: AnalysisTemplate,
  settings: AiSettings,
  modelClient: ModelClient = callOpenAICompatible,
): Promise<AnalysisRun> {
  if (!settings.apiKey.trim()) {
    throw new Error("请先配置 OpenAI-compatible API Key");
  }
  if (!settings.model.trim()) {
    throw new Error("请先配置模型名称");
  }

  const request = createModelRequest(article, template, settings.model);
  const raw = await modelClient(request, settings);
  const parsed = parseModelResponse(raw);
  const topicCandidates: TopicCandidate[] = parsed.topicCandidates.map((candidate) => ({
    ...candidate,
    id: createId("topic"),
    evidenceArticleIds: [article.id],
    status: "new",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }));

  return {
    id: createId("run"),
    articleId: article.id,
    templateId: template.id,
    templateName: template.name,
    lens: template.lens,
    summary: parsed.summary,
    technicalInsights: parsed.technicalInsights,
    risks: parsed.risks,
    reusableAngles: parsed.reusableAngles,
    viralScore: parsed.viralScore,
    topicCandidates,
    modelMetadata: {
      provider: settings.modelProvider || "openai-compatible",
      model: settings.model,
    },
    createdAt: nowIso(),
  };
}

export function createDraftContextAnalysisRun(article: Article): AnalysisRun {
  const contentText = stripHtml(article.contentText || article.contentHtml || article.content);
  const summary = clipText(contentText, 260) || "原文内容较短，生成时需要围绕标题、来源和分类补足结构。";
  const category = article.category || "未分类";

  return {
    id: createId("run"),
    articleId: article.id,
    templateId: "auto-draft-context",
    templateName: "自动长文上下文",
    lens: "微信公众号专业长文",
    summary: `${article.title}：${summary}`,
    technicalInsights: [
      "从原文提取核心问题、技术机制、工程约束和可落地路径，作为专业长文的基础素材。",
      `文章分类：${category}；来源：${article.sourceName}`,
    ],
    risks: ["未经过人工 AI 拆解，生成时需要避免夸大原文没有提供的证据和结论。"],
    reusableAngles: [`围绕“${article.title}”重写为面向 AI 从业者、企业老板和咨询客户的专业公众号长文。`],
    viralScore: {
      total: 62,
      dimensions: {
        pain: 16,
        novelty: 15,
        evidence: 16,
        debate: 15,
      },
      reasons: ["自动上下文用于一步生成，适合先产出草稿，再由用户编辑。"],
    },
    topicCandidates: [
      {
        id: createId("topic"),
        title: article.title,
        hook: "把原文里的技术信息转成可读、可判断、可落地的公众号长文。",
        targetReader: "AI 从业者、企业老板、AI 咨询客户",
        angle: category,
        evidenceArticleIds: [article.id],
        viralScore: 62,
        status: "new",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    ],
    modelMetadata: {
      provider: "openai-compatible",
      model: "auto-draft-context",
    },
    createdAt: nowIso(),
  };
}

export function createModelRequest(article: Article, template: AnalysisTemplate, model: string): ModelRequest {
  return {
    model,
    temperature: 0.35,
    max_output_tokens: 1800,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "你是一个负责经营 AI 深度公众号的内容研究员。只输出 JSON，不要 Markdown。所有评分必须给出理由。",
      },
      {
        role: "user",
        content: [
          `拆解模板：${template.name}`,
          `模板视角：${template.lens}`,
          `模板要求：${template.prompt}`,
          `评分维度：${template.scoringRubric.join("、")}`,
          "",
          `标题：${article.title}`,
          `来源：${article.sourceName}`,
          `作者：${article.author || "未知"}`,
          `标签：${article.tags.join("、") || "无"}`,
          "",
          `正文：${article.contentText.slice(0, 12000)}`,
          "",
          "请返回紧凑 JSON：summary 不超过 120 字；technicalInsights、risks、reusableAngles、topicCandidates 各最多 3 条；viralScore 使用 0-100 分。字段为 summary, technicalInsights[], risks[], reusableAngles[], viralScore{total, dimensions{pain, novelty, evidence, debate}, reasons[]}, topicCandidates[{title, hook, targetReader, angle, viralScore}]。",
        ].join("\n"),
      },
    ],
  };
}

export async function callOpenAICompatible(request: ModelRequest, settings: AiSettings): Promise<unknown> {
  const baseUrl = settings.baseUrl.trim() || "https://api.openai.com/v1";
  if (settings.wireApi === "responses") {
    return await callResponsesApi(request, settings, baseUrl);
  }

  const { max_output_tokens: maxOutputTokens, ...chatRequest } = request;
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...chatRequest,
      max_tokens: maxOutputTokens,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`模型调用失败：${response.status} ${text.slice(0, 160)}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? data;
}

async function callResponsesApi(request: ModelRequest, settings: AiSettings, baseUrl: string): Promise<unknown> {
  const instructions = request.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const input = request.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role,
      content: [{ type: "input_text", text: message.content }],
    }));
  const body = {
    model: request.model,
    input: input.length > 0 ? input : request.messages.map((message) => message.content).join("\n\n"),
    instructions: instructions || undefined,
    temperature: request.temperature,
    max_output_tokens: request.max_output_tokens,
    reasoning: toResponsesReasoning(settings.reasoningEffort),
    store: settings.disableResponseStorage ? false : undefined,
    text: {
      format: request.response_format,
    },
  };
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`模型调用失败：${response.status} ${text.slice(0, 220)}`);
  }

  return extractResponsesOutputText(await response.json());
}

function extractResponsesOutputText(data: unknown): unknown {
  if (!isRecord(data)) {
    return data;
  }
  if (typeof data.output_text === "string") {
    return data.output_text;
  }
  if (Array.isArray(data.output)) {
    const text = data.output
      .flatMap((item) => (isRecord(item) && Array.isArray(item.content) ? item.content : []))
      .map((content) => (isRecord(content) && typeof content.text === "string" ? content.text : ""))
      .filter(Boolean)
      .join("");
    if (text) {
      return text;
    }
  }
  return data;
}

function toResponsesReasoning(effort: AiSettings["reasoningEffort"]): { effort: "minimal" | "low" | "medium" | "high" } | undefined {
  if (!effort || effort === "none") {
    return undefined;
  }
  return { effort: effort === "xhigh" ? "high" : effort };
}

export function parseModelResponse(raw: unknown): {
  summary: string;
  technicalInsights: string[];
  risks: string[];
  reusableAngles: string[];
  viralScore: ViralScore;
  topicCandidates: Array<Omit<TopicCandidate, "id" | "analysisRunId" | "evidenceArticleIds" | "status">>;
} {
  const value = typeof raw === "string" ? parseJsonString(raw) : raw;
  const parsed = responseSchema.parse(normalizeModelPayload(value));
  return parsed;
}

export function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clipText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function parseJsonString(value: string): unknown {
  const withoutFence = value.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(withoutFence);
}

function normalizeModelPayload(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = { ...value };
  for (const key of ["technicalInsights", "risks", "reusableAngles"]) {
    normalized[key] = normalizeStringArray(normalized[key]);
  }

  if (isRecord(normalized.viralScore)) {
    normalized.viralScore = normalizeViralScore(normalized.viralScore);
  }

  if (Array.isArray(normalized.topicCandidates)) {
    normalized.topicCandidates = normalized.topicCandidates.map((candidate) => {
      if (!isRecord(candidate)) {
        return candidate;
      }
      return {
        ...candidate,
        title: normalizeText(candidate.title),
        hook: normalizeText(candidate.hook),
        targetReader: normalizeText(candidate.targetReader),
        angle: normalizeText(candidate.angle),
        viralScore: normalizeScore(candidate.viralScore),
      };
    });
  }

  return normalized;
}

function normalizeStringArray(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((item) => normalizeText(item));
}

function normalizeText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean).join("；");
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, nestedValue]) => `${key}: ${normalizeText(nestedValue)}`)
      .filter((item) => item.trim() !== "")
      .join("；");
  }
  return "";
}

function normalizeScore(value: unknown): unknown {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
  }
  if (isRecord(value)) {
    for (const key of ["total", "score", "value", "viralScore", "totalScore"]) {
      const candidate = normalizeScore(value[key]);
      if (typeof candidate === "number") {
        return clampScore(candidate);
      }
    }
    if (isRecord(value.dimensions)) {
      const total = Object.values(value.dimensions).reduce<number>((sum, item) => {
        const candidate = normalizeScore(item);
        return typeof candidate === "number" ? sum + candidate : sum;
      }, 0);
      if (total > 0) {
        return clampScore(total);
      }
    }
    for (const item of Object.values(value)) {
      const candidate = normalizeScore(item);
      if (typeof candidate === "number") {
        return clampScore(candidate);
      }
    }
  }
  return value;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function normalizeViralScore(value: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    ...value,
    total: normalizeScore(value.total),
  };

  if (isRecord(value.dimensions)) {
    normalized.dimensions = {
      ...value.dimensions,
      pain: normalizeDimensionScore(value.dimensions.pain),
      novelty: normalizeDimensionScore(value.dimensions.novelty),
      evidence: normalizeDimensionScore(value.dimensions.evidence),
      debate: normalizeDimensionScore(value.dimensions.debate),
    };
  }

  return normalized;
}

function normalizeDimensionScore(value: unknown): unknown {
  const normalized = normalizeScore(value);
  if (typeof normalized !== "number") {
    return normalized;
  }
  return Math.max(0, Math.min(25, normalized > 25 ? Math.round(normalized / 4) : normalized));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
