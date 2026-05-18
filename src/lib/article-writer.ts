import { z } from "zod";
import { callOpenAICompatible, type ModelClient, type ModelRequest } from "@/lib/analysis";
import type { AiSettings, AnalysisRun, Article, ProfessionalArticleDraft } from "@/lib/types";

const professionalDraftSchema = z.object({
  title: z.string().min(1),
  deck: z.string().default(""),
  bodyHtml: z.string().min(1),
  pullQuotes: z.array(z.string()).default([]),
  imageBriefs: z
    .array(
      z.object({
        role: z.enum(["hero", "explanation"]),
        prompt: z.string().min(1),
        alt: z.string().default(""),
        caption: z.string().default(""),
      }),
    )
    .default([]),
});

export function createProfessionalDraftRequest(article: Article, run: AnalysisRun, model: string): ModelRequest {
  return {
    model,
    temperature: 0.48,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "你是一个懂 AI 工程化和企业咨询的微信公众号主笔。",
          "写作目标：专业、可读、少 AI 味，像强工程博客一样可信，但按中文公众号阅读节奏组织。",
          "风格借鉴 Harness Engineering Blog 的工程纪律：问题先行、生产约束、架构取舍、失败模式、指标、迁移路径。",
          "不要使用 首先/其次/综上/值得注意的是/在当今时代 这类模板化连接词。",
          "只输出 JSON，不要 Markdown，不要解释 JSON 外的内容。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "请基于原文和拆解结果生成一篇可直接进入微信草稿的专业长文。",
          "",
          "必须返回 JSON 字段：",
          "title: string",
          "deck: string",
          "bodyHtml: string，包含 h1/h2/p/ul/li/blockquote/figure 占位结构，不要内联脚本",
          "pullQuotes: string[]",
          "imageBriefs: [{role: 'hero'|'explanation', prompt: string, alt: string, caption: string}]",
          "",
          "正文结构要求：",
          "1. 前 300 字必须有一个具体场景或冲突，不要先讲宏大趋势。",
          "2. 正文必须覆盖：生产约束、架构取舍、失败模式、指标、迁移路径。",
          "3. 每 2-4 段给出一个明确判断，减少空泛形容词。",
          "4. 面向读者同时包括 AI 从业者、企业老板、AI 咨询客户。",
          "5. 图片 brief 必须实用：hero 用作封面，explanation 用作架构图/流程图/风险矩阵。",
          "",
          `原文标题：${article.title}`,
          `来源：${article.sourceName}`,
          `作者：${article.author || "未知"}`,
          `标签：${article.tags.join("、") || "无"}`,
          "",
          `拆解摘要：${run.summary}`,
          `技术洞察：${run.technicalInsights.join("；")}`,
          `风险与反方问题：${run.risks.join("；")}`,
          `可复用角度：${run.reusableAngles.join("；")}`,
          `爆款评分：${run.viralScore.total}，理由：${run.viralScore.reasons.join("；")}`,
          "",
          `原文正文：${article.contentText.slice(0, 12000)}`,
        ].join("\n"),
      },
    ],
  };
}

export async function generateProfessionalArticleDraft(
  article: Article,
  run: AnalysisRun,
  settings: AiSettings,
  modelClient: ModelClient = callOpenAICompatible,
): Promise<ProfessionalArticleDraft> {
  if (!settings.apiKey.trim()) {
    throw new Error("请先配置 OpenAI-compatible API Key");
  }
  if (!settings.model.trim()) {
    throw new Error("请先配置文本模型名称");
  }

  const request = createProfessionalDraftRequest(article, run, settings.model);
  const raw = await modelClient(request, settings);
  return parseProfessionalDraftResponse(raw);
}

export function parseProfessionalDraftResponse(raw: unknown): ProfessionalArticleDraft {
  const value = typeof raw === "string" ? parseJsonString(raw) : raw;
  const parsed = professionalDraftSchema.parse(normalizeProfessionalDraft(value));
  return {
    ...parsed,
    imageBriefs: ensureDefaultImageBriefs(parsed),
  };
}

function ensureDefaultImageBriefs(draft: ProfessionalArticleDraft): ProfessionalArticleDraft["imageBriefs"] {
  const briefs = [...draft.imageBriefs];
  if (!briefs.some((brief) => brief.role === "hero")) {
    briefs.unshift({
      role: "hero",
      prompt: `Clean technical magazine cover for: ${draft.title}. Professional AI engineering theme, no dense text.`,
      alt: `${draft.title}封面图`,
      caption: draft.deck || draft.title,
    });
  }
  if (!briefs.some((brief) => brief.role === "explanation")) {
    briefs.push({
      role: "explanation",
      prompt: `Architecture explainer diagram for: ${draft.title}. Show constraints, control plane, feedback loops, and risks.`,
      alt: `${draft.title}解释图`,
      caption: "核心架构与风险关系示意。",
    });
  }
  return briefs.slice(0, 2);
}

function parseJsonString(value: string): unknown {
  const withoutFence = value.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(withoutFence);
}

function normalizeProfessionalDraft(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  return {
    ...value,
    title: normalizeText(value.title),
    deck: normalizeText(value.deck),
    bodyHtml: normalizeText(value.bodyHtml),
    pullQuotes: normalizeStringArray(value.pullQuotes),
    imageBriefs: normalizeImageBriefs(value.imageBriefs),
  };
}

function normalizeImageBriefs(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((brief) => {
    if (!isRecord(brief)) {
      return brief;
    }
    const role = brief.role === "explanation" ? "explanation" : "hero";
    return {
      role,
      prompt: normalizeText(brief.prompt),
      alt: normalizeText(brief.alt),
      caption: normalizeText(brief.caption),
    };
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeText(item)).filter(Boolean);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
