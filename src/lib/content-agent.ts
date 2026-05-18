import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { callOpenAICompatible, type ModelClient, type ModelRequest } from "@/lib/analysis";
import { createId, nowIso } from "@/lib/ids";
import type { AiSettings, AnalysisTemplate, Article, ContentAgentRun, ContentAgentStep } from "@/lib/types";

type ContentAgentRunRow = {
  id: string;
  article_id: string;
  status: ContentAgentRun["status"];
  steps_json: string;
  article_type: ContentAgentRun["articleType"];
  quality_score: number;
  recommended_template_ids_json: string;
  recommended_action: ContentAgentRun["recommendedAction"];
  reasoning_summary: string;
  created_at: string;
};

type MaybePromise<T> = T | Promise<T>;

type ContentAgentStore = {
  saveAgentRun(run: ContentAgentRun): MaybePromise<ContentAgentRun>;
};

const responseSchema = z.object({
  articleType: z.enum(["technical-deep-dive", "news-analysis", "product-release", "case-study", "opinion", "unknown"]),
  qualityScore: z.number().min(0).max(100),
  recommendedTemplateIds: z.array(z.string()).default([]),
  recommendedAction: z.enum(["analyze", "generate-draft", "supplement", "archive"]),
  reasoningSummary: z.string(),
  steps: z
    .array(
      z.object({
        name: z.string(),
        status: z.enum(["ok", "warning", "error"]),
        message: z.string(),
      }),
    )
    .default([]),
});

export function createContentAgentStore(db: DatabaseSync) {
  return {
    saveAgentRun(run: ContentAgentRun): ContentAgentRun {
      db.prepare(`
        INSERT INTO content_agent_runs (
          id, article_id, status, steps_json, article_type, quality_score,
          recommended_template_ids_json, recommended_action, reasoning_summary, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        run.id,
        run.articleId,
        run.status,
        JSON.stringify(run.steps),
        run.articleType,
        run.qualityScore,
        JSON.stringify(run.recommendedTemplateIds),
        run.recommendedAction,
        run.reasoningSummary,
        run.createdAt,
      );
      return run;
    },

    listAgentRuns(articleId?: string): ContentAgentRun[] {
      const rows = articleId
        ? (db
            .prepare("SELECT * FROM content_agent_runs WHERE article_id = ? ORDER BY created_at DESC")
            .all(articleId) as ContentAgentRunRow[])
        : (db.prepare("SELECT * FROM content_agent_runs ORDER BY created_at DESC").all() as ContentAgentRunRow[]);
      return rows.map(mapContentAgentRun);
    },
  };
}

export async function runContentAgent(
  article: Article,
  templates: AnalysisTemplate[],
  settings: AiSettings,
  store: ContentAgentStore,
  modelClient: ModelClient = callOpenAICompatible,
): Promise<ContentAgentRun> {
  if (!settings.apiKey.trim() || !settings.model.trim()) {
    return await store.saveAgentRun(
      createFailedRun(article.id, "请先配置本地模型服务和 API Key，Agent 才能智能判断文章质量与推荐模板。"),
    );
  }

  try {
    const request = createContentAgentRequest(article, templates, settings.model);
    const raw = await modelClient(request, settings);
    const parsed = parseContentAgentResponse(raw, templates);
    return await store.saveAgentRun({
      id: createId("agent"),
      articleId: article.id,
      status: "completed",
      steps: parsed.steps.length > 0 ? parsed.steps : defaultSteps(article),
      articleType: parsed.articleType,
      qualityScore: parsed.qualityScore,
      recommendedTemplateIds: parsed.recommendedTemplateIds,
      recommendedAction: parsed.recommendedAction,
      reasoningSummary: parsed.reasoningSummary,
      createdAt: nowIso(),
    });
  } catch (error) {
    return await store.saveAgentRun(
      createFailedRun(article.id, error instanceof Error ? error.message : String(error)),
    );
  }
}

export function createContentAgentRequest(
  article: Article,
  templates: AnalysisTemplate[],
  model: string,
): ModelRequest {
  return {
    model,
    temperature: 0.25,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "你是技术文章库的内容处理 Agent。你要判断文章质量、类型、适合的分析模板和下一步动作。只输出 JSON。",
      },
      {
        role: "user",
        content: [
          `标题：${article.title}`,
          `来源：${article.sourceName}`,
          `来源类型：${article.sourceType}`,
          `标签：${article.tags.join("、") || "无"}`,
          `可用模板：${templates.map((template) => `${template.id}:${template.name}`).join("；")}`,
          "",
          `正文：${article.contentText.slice(0, 8000)}`,
          "",
          "返回 JSON：articleType, qualityScore, recommendedTemplateIds[], recommendedAction, reasoningSummary, steps[{name,status,message}]。",
          "recommendedTemplateIds 只能从可用模板 id 中选择。recommendedAction 只能是 analyze/generate-draft/supplement/archive。",
        ].join("\n"),
      },
    ],
  };
}

export function parseContentAgentResponse(raw: unknown, templates: AnalysisTemplate[]): Omit<ContentAgentRun, "id" | "articleId" | "status" | "createdAt"> {
  const value = typeof raw === "string" ? parseJsonString(raw) : raw;
  const parsed = responseSchema.parse(normalizePayload(value));
  const allowed = new Set(templates.map((template) => template.id));
  const recommendedTemplateIds = parsed.recommendedTemplateIds.filter((id) => allowed.has(id));
  return {
    articleType: parsed.articleType,
    qualityScore: parsed.qualityScore,
    recommendedTemplateIds: recommendedTemplateIds.length > 0 ? recommendedTemplateIds : [templates[0]?.id].filter(Boolean),
    recommendedAction: parsed.recommendedAction,
    reasoningSummary: parsed.reasoningSummary,
    steps: parsed.steps,
  };
}

function createFailedRun(articleId: string, message: string): ContentAgentRun {
  return {
    id: createId("agent"),
    articleId,
    status: "failed",
    steps: [{ name: "Agent 处理", status: "error", message }],
    articleType: "unknown",
    qualityScore: 0,
    recommendedTemplateIds: [],
    recommendedAction: "supplement",
    reasoningSummary: message,
    createdAt: nowIso(),
  };
}

function defaultSteps(article: Article): ContentAgentStep[] {
  return [
    {
      name: "解析质量",
      status: article.contentText.length > 200 ? "ok" : "warning",
      message: article.contentText.length > 200 ? "正文长度足够进行分析" : "正文偏短，建议补充来源或手动修正文稿",
    },
  ];
}

function normalizePayload(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  return {
    ...value,
    qualityScore: normalizeScore(value.qualityScore),
    recommendedTemplateIds: Array.isArray(value.recommendedTemplateIds)
      ? value.recommendedTemplateIds.map((item) => String(item))
      : [],
    steps: Array.isArray(value.steps) ? value.steps.map(normalizeStep) : [],
  };
}

function normalizeStep(value: unknown): ContentAgentStep {
  if (!isRecord(value)) {
    return { name: "Agent 步骤", status: "warning", message: String(value) };
  }
  const status = value.status === "error" || value.status === "warning" ? value.status : "ok";
  return {
    name: typeof value.name === "string" ? value.name : "Agent 步骤",
    status,
    message: typeof value.message === "string" ? value.message : "",
  };
}

function normalizeScore(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0;
}

function parseJsonString(value: string): unknown {
  return JSON.parse(value.replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapContentAgentRun(row: ContentAgentRunRow): ContentAgentRun {
  return {
    id: row.id,
    articleId: row.article_id,
    status: row.status,
    steps: parseJson<ContentAgentStep[]>(row.steps_json, []),
    articleType: row.article_type,
    qualityScore: row.quality_score,
    recommendedTemplateIds: parseJson<string[]>(row.recommended_template_ids_json, []),
    recommendedAction: row.recommended_action,
    reasoningSummary: row.reasoning_summary,
    createdAt: row.created_at,
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
