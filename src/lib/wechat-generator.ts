import { z } from "zod";
import { callOpenAICompatible, stripHtml, type ModelClient, type ModelRequest } from "@/lib/analysis";
import type { AiSettings } from "@/lib/types";

export type WeChatGenerateMode = "keep-title" | "new-title";
export type WeChatGenerateArticleType = "share" | "guide" | "tutorial" | "commerce" | "review" | "insight" | "free";
export type WeChatGenerateLength = "short" | "medium" | "long" | "xlong" | "free";

export type WeChatGenerateOptions = {
  quoteTitle: boolean;
  addEmoji: boolean;
  addHashtags: boolean;
  filterSensitiveWords: boolean;
  filterMarketingWords: boolean;
};

export type WeChatGenerateInput = {
  title: string;
  mode: WeChatGenerateMode;
  articleType: WeChatGenerateArticleType;
  length: WeChatGenerateLength;
  options: WeChatGenerateOptions;
  brief: string;
  audience: string;
  persona: string;
  referenceNotes: string;
};

export type GeneratedWeChatArticle = {
  title: string;
  deck: string;
  summary: string;
  coverLine: string;
  bodyHtml: string;
  plainText: string;
  hashtags: string[];
};

export const DEFAULT_WECHAT_GENERATE_OPTIONS: WeChatGenerateOptions = {
  quoteTitle: false,
  addEmoji: true,
  addHashtags: true,
  filterSensitiveWords: true,
  filterMarketingWords: true,
};

const generatedArticleSchema = z.object({
  title: z.string().min(1),
  deck: z.string().default(""),
  summary: z.string().default(""),
  coverLine: z.string().default(""),
  bodyHtml: z.string().min(1),
  hashtags: z.array(z.string()).default([]),
});

export function createWeChatGenerateRequest(input: WeChatGenerateInput, model: string): ModelRequest {
  const titleRule =
    input.mode === "keep-title"
      ? "标题必须沿用用户提供的原标题，不要改写。"
      : input.options.quoteTitle
        ? "请基于原标题的关键词生成一个更适合公众号传播的新标题，但不要抄模板化爆款句式。"
        : "请生成一个自然、具体、不夸张的新标题。";

  const emojiRule = input.options.addEmoji ? "可少量使用自然表情，但不要每段都加。" : "不要使用任何 emoji 或颜文字。";
  const hashtagRule = input.options.addHashtags
    ? "返回 3 到 6 个适合公众号或社媒分发的话题标签。"
    : "hashtags 返回空数组，正文和摘要都不要添加话题标签。";
  const sensitiveRule = input.options.filterSensitiveWords
    ? "避免敏感、违规、过度承诺、医疗化、绝对化表达。"
    : "不需要额外做敏感词过滤，但仍然保持合规。";
  const marketingRule = input.options.filterMarketingWords
    ? "过滤营销味和喊单味表达，比如“闭眼入”“赶紧冲”“错过再等一年”“封神”“逆天改命”。"
    : "允许轻微传播感，但不要写成销售文案。";

  return {
    model,
    temperature: 0.68,
    max_output_tokens: 4200,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "你是一个成熟的中文公众号主编，擅长把用户给出的主题和背景信息写成可信、自然、好读的公众号正文。",
          "你的目标不是写空泛套路文，而是写出像真人运营者会发的公众号内容。",
          "事实性优先，不要编造未提供的经历、数据、采访、案例、政策或用户反馈。",
          "如果信息不足，就用更稳妥的经验表达，不要硬编细节。",
          "每段尽量短，适合手机阅读。",
          "避免模板化连接词和廉价爆款口吻，避免“首先、其次、总之、在这个时代”这类空泛过渡。",
          "正文使用安全 HTML，只允许 h1、h2、h3、p、ul、li、blockquote、strong。",
          "不要输出 Markdown，不要输出 JSON 之外的任何解释。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "请根据下面的要求生成一篇适合微信公众号发布的原创正文。",
          "",
          "返回 JSON 字段：",
          "title: string",
          "deck: string",
          "summary: string，80-120 字",
          "coverLine: string，用作封面副标题或封面文案",
          "bodyHtml: string",
          "hashtags: string[]",
          "",
          "写作要求：",
          titleRule,
          `文章类型：${articleTypeLabel(input.articleType)}`,
          `目标篇幅：${lengthLabel(input.length)}`,
          emojiRule,
          hashtagRule,
          sensitiveRule,
          marketingRule,
          "开头先进入具体场景、真实问题或直接判断，不要先讲大趋势空话。",
          "正文要有明确结构，至少包含：开场判断、展开说明、具体建议、收束结尾。",
          "语言要适合公众号，不要写成知乎回答，不要写成小红书分镜脚本。",
          "",
          `原标题：${input.title.trim()}`,
          `内容方向：${emptyFallback(input.brief, "未提供，需根据标题和补充背景自行组织")}`,
          `目标读者：${emptyFallback(input.audience, "普通公众号读者")}`,
          `作者/账号人设：${emptyFallback(input.persona, "专业、克制、可信的公众号作者")}`,
          `补充背景：${emptyFallback(input.referenceNotes, "无")}`,
        ].join("\n"),
      },
    ],
  };
}

export async function generateWeChatArticle(
  input: WeChatGenerateInput,
  settings: AiSettings,
  modelClient: ModelClient = callOpenAICompatible,
): Promise<GeneratedWeChatArticle> {
  if (!settings.apiKey.trim()) {
    throw new Error("请先在配置中心填写 API Key");
  }
  if (!settings.model.trim()) {
    throw new Error("请先在配置中心填写文本模型");
  }

  const raw = await modelClient(createWeChatGenerateRequest(input, settings.model), settings);
  return parseGeneratedWeChatArticle(raw, input);
}

export function parseGeneratedWeChatArticle(raw: unknown, input?: Pick<WeChatGenerateInput, "mode" | "title" | "options">): GeneratedWeChatArticle {
  const value = typeof raw === "string" ? parseJsonString(raw) : raw;
  const parsed = generatedArticleSchema.parse(normalizeGeneratedArticle(value));
  const bodyHtml = normalizeBodyHtml(parsed.bodyHtml);
  const plainText = stripHtml(bodyHtml);
  const normalizedTitle =
    input?.mode === "keep-title" && input.title.trim() ? input.title.trim() : normalizeInlineText(parsed.title) || "未命名公众号正文";
  const hashtags = input?.options?.addHashtags === false ? [] : normalizeHashtags(parsed.hashtags);

  return {
    title: normalizedTitle,
    deck: normalizeInlineText(parsed.deck),
    summary: normalizeInlineText(parsed.summary) || clipText(plainText, 118),
    coverLine: normalizeInlineText(parsed.coverLine) || normalizeInlineText(parsed.deck) || normalizedTitle,
    bodyHtml,
    plainText,
    hashtags,
  };
}

function normalizeGeneratedArticle(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  return {
    title: normalizeInlineText(value.title),
    deck: normalizeInlineText(value.deck),
    summary: normalizeInlineText(value.summary),
    coverLine: normalizeInlineText(value.coverLine),
    bodyHtml: normalizeInlineText(value.bodyHtml),
    hashtags: Array.isArray(value.hashtags) ? value.hashtags.map((item) => normalizeInlineText(item)).filter(Boolean) : [],
  };
}

function normalizeBodyHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "<p>暂无正文</p>";
  }
  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return trimmed;
  }
  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

function normalizeHashtags(value: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const normalized = normalizeInlineText(item).replace(/^#+/, "").replace(/\s+/g, "");
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(`#${normalized}`);
    if (result.length >= 6) {
      break;
    }
  }
  return result;
}

function normalizeInlineText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeInlineText(item)).filter(Boolean).join("，");
  }
  if (isRecord(value)) {
    return Object.values(value).map((item) => normalizeInlineText(item)).filter(Boolean).join("，");
  }
  return "";
}

function articleTypeLabel(value: WeChatGenerateArticleType): string {
  switch (value) {
    case "share":
      return "分享";
    case "guide":
      return "攻略";
    case "tutorial":
      return "教程";
    case "commerce":
      return "电商";
    case "review":
      return "测评";
    case "insight":
      return "干货";
    default:
      return "任意";
  }
}

function lengthLabel(value: WeChatGenerateLength): string {
  switch (value) {
    case "short":
      return "200 字左右";
    case "medium":
      return "300 字左右";
    case "long":
      return "500 字左右";
    case "xlong":
      return "800 字左右";
    default:
      return "不限字数，但要避免注水";
  }
}

function emptyFallback(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed || fallback;
}

function clipText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function parseJsonString(value: string): unknown {
  return JSON.parse(value.replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
