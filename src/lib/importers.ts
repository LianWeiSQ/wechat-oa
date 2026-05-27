import { createId, nowIso } from "@/lib/ids";
import { suggestArticleCategoryByAttribution } from "@/lib/article-categories";
import type { Article, ArticleInput, ArticleParseRun, ArticleSourceType } from "@/lib/types";

type MaybePromise<T> = T | Promise<T>;

type ArticleStore = {
  createArticle(input: ArticleInput): MaybePromise<Article>;
  getArticleByUrl?(originalUrl: string): MaybePromise<Article | null>;
  updateArticle?(id: string, input: Partial<ArticleInput>): MaybePromise<Article | null>;
  saveParseRun(run: ArticleParseRun): MaybePromise<ArticleParseRun>;
};
type ImportFetch = (
  url: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

export type UrlImportResult =
  | { ok: true; article: Article; parseRun: ArticleParseRun }
  | {
      ok: false;
      reason: string;
      fallback: ArticleInput & { originalUrl: string };
      parseRun: ArticleParseRun;
    };

export function importManualArticle(store: ArticleStore, input: ArticleInput): MaybePromise<Article> {
  if (!input.title.trim()) {
    throw new Error("标题不能为空");
  }
  const sourceName = input.sourceName ?? input.sourceAccount;
  if (!sourceName?.trim()) {
    throw new Error("来源名称不能为空");
  }
  const content = input.contentText ?? input.contentHtml ?? input.content;
  if (!content?.trim()) {
    throw new Error("正文不能为空");
  }
  return store.createArticle({ ...input, sourceName });
}

export async function importUrlArticle(
  store: ArticleStore,
  originalUrl: string,
  fetcher: ImportFetch = fetch,
  options: { sourceProject?: string } = {},
): Promise<UrlImportResult> {
  const url = originalUrl.trim();
  if (!url) {
    return createFallback(url, "请输入公众号文章 URL");
  }

  try {
    const response = await fetcher(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 WeChat-OA-Local-Workbench",
      },
    });
    if (!response.ok) {
      return createFallback(url, `无法解析文章：请求返回 ${response.status}`);
    }

    const html = await response.text();
    const parsed = parseArticleHtml(html, url);
    const articleInput = {
      ...parsed.article,
      sourceProject: options.sourceProject?.trim() || parsed.article.sourceProject || parsed.article.sourceName,
    };
    if (!articleInput.contentText?.trim() || !articleInput.title.trim()) {
      return createFallback(url, "无法解析文章正文，请改用手动粘贴", parsed.parseRun);
    }
    const existing = store.getArticleByUrl ? await store.getArticleByUrl(url) : null;
    const article =
      existing && store.updateArticle
        ? (await store.updateArticle(existing.id, articleInput)) ?? existing
        : await store.createArticle(articleInput);
    const parseRun = await store.saveParseRun({ ...parsed.parseRun, articleId: article.id });
    return { ok: true, article, parseRun };
  } catch (error) {
    return createFallback(url, `无法解析文章：${error instanceof Error ? error.message : "网络错误"}`);
  }
}

function createFallback(originalUrl: string, reason: string, parseRun?: ArticleParseRun): UrlImportResult {
  return {
    ok: false,
    reason,
    fallback: {
      title: "",
      sourceName: "",
      sourceType: inferSourceType(originalUrl),
      originalUrl,
      author: "",
      publishedAt: "",
      contentHtml: "",
      contentText: "",
      tags: [],
    },
    parseRun:
      parseRun ??
      createParseRun({
        url: originalUrl,
        status: "fallback",
        strategy: inferSourceType(originalUrl) === "wechat" ? "wechat" : "generic-web",
        qualityScore: 0,
        metadata: {},
        fallbackReason: reason,
      }),
  };
}

function parseArticleHtml(html: string, originalUrl: string): { article: ArticleInput; parseRun: ArticleParseRun } {
  return inferSourceType(originalUrl) === "wechat"
    ? parseWeChatHtml(html, originalUrl)
    : parseGenericHtml(html, originalUrl);
}

function parseWeChatHtml(html: string, originalUrl: string): { article: ArticleInput; parseRun: ArticleParseRun } {
  const contentMatch = html.match(/<div[^>]+id=["']js_content["'][^>]*>([\s\S]*?)<\/div>\s*<script/i);
  const rawContent = contentMatch?.[1] ?? "";
  const contentHtml = trimWeChatBoilerplate(cleanHtml(rawContent, originalUrl));
  const contentText = htmlToText(contentHtml);
  const title =
    readMeta(html, "og:title") ??
    readMeta(html, "twitter:title") ??
    readTitle(html) ??
    "";
  const sourceName = readMeta(html, "og:site_name") ?? readVariable(html, "nickname") ?? "未知公众号";
  const author = readMeta(html, "author") ?? readVariable(html, "author") ?? "";
  const publishedAt = readVariable(html, "ct") ? timestampToDate(readVariable(html, "ct") ?? "") : "";

  return {
    article: {
      title,
      sourceType: "wechat",
      sourceName,
      sourceProject: sourceName,
      originalUrl,
      author,
      publishedAt,
      contentHtml,
      contentText,
      category: suggestArticleCategoryByAttribution({ sourceName, author }),
      tags: [],
    },
    parseRun: createParseRun({
      url: originalUrl,
      status: contentText ? "parsed" : "fallback",
      strategy: "wechat",
      qualityScore: scoreQuality(title, contentText),
      metadata: { title, sourceName, author, publishedAt, wordCount: countWords(contentText) },
      fallbackReason: contentText ? "" : "无法解析公众号正文",
    }),
  };
}

function parseGenericHtml(html: string, originalUrl: string): { article: ArticleInput; parseRun: ArticleParseRun } {
  const rawContent = extractMainContent(html);
  const contentHtml = cleanHtml(rawContent, originalUrl);
  const contentText = htmlToText(contentHtml);
  const title = readMeta(html, "og:title") ?? readMeta(html, "twitter:title") ?? readTitle(html) ?? "";
  const sourceName = readMeta(html, "og:site_name") ?? hostnameFromUrl(originalUrl) ?? "未知来源";
  const author = readMeta(html, "author") ?? "";
  const publishedAt = readMeta(html, "article:published_time")?.slice(0, 10) ?? "";

  return {
    article: {
      title,
      sourceType: "web",
      sourceName,
      sourceProject: sourceName,
      originalUrl,
      author,
      publishedAt,
      contentHtml,
      contentText,
      category: suggestArticleCategoryByAttribution({ sourceName, author }),
      tags: [],
    },
    parseRun: createParseRun({
      url: originalUrl,
      status: contentText ? "parsed" : "fallback",
      strategy: "generic-web",
      qualityScore: scoreQuality(title, contentText),
      metadata: { title, sourceName, author, publishedAt, wordCount: countWords(contentText) },
      fallbackReason: contentText ? "" : "无法解析网页正文",
    }),
  };
}

function readMeta(html: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtml(match[1].trim());
    }
  }
  return null;
}

function readTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1].trim()) : null;
}

function readVariable(html: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`var\\s+${escaped}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match?.[1] ? decodeHtml(match[1].trim()) : null;
}

function cleanHtml(html: string, baseUrl: string): string {
  return html
    .replace(/<img\b[^>]*>/gi, (tag) => normalizeImageTag(tag, baseUrl))
    .replace(/<\s*(script|style|iframe|video|audio|canvas|form|button|input|textarea|select|svg)\b[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|video|audio|canvas|form|button|input|textarea|select|svg)\b[^>]*\/?>/gi, "")
    .replace(/\s(?:style|class|id|width|height|align|color|bgcolor|face|size|role|tabindex)=("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:data-[\w-]+|aria-[\w-]+|on[a-z]+)=("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<p\b[^>]*>\s*(?:&nbsp;|<br\s*\/?>|\s)*<\/p>/gi, "")
    .replace(/<div\b[^>]*>\s*(?:&nbsp;|<br\s*\/?>|\s)*<\/div>/gi, "")
    .replace(/(?:\s*<br\s*\/?>\s*){3,}/gi, "<br /><br />")
    .replace(/>\s{2,}</g, "><")
    .trim();
}

function trimWeChatBoilerplate(html: string): string {
  return cropAtWeChatTailMarker(dropLeadingWeChatBoilerplate(html)).trim();
}

function dropLeadingWeChatBoilerplate(html: string): string {
  let result = html.trim();
  for (let index = 0; index < 5; index += 1) {
    const match = result.match(/^\s*<(p|section|div|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/i);
    if (!match || !isLeadingWeChatBoilerplate(match[2])) {
      break;
    }
    result = result.slice(match[0].length).trim();
  }
  return result;
}

function isLeadingWeChatBoilerplate(html: string): boolean {
  const text = htmlToText(html);
  return text.length <= 120 && /(发自|公众号|作者|来源|编辑|出品|量子位|qbitai)/i.test(text);
}

function cropAtWeChatTailMarker(html: string): string {
  const minimumTailIndex = Math.max(160, html.length * 0.35);
  const marker = findWeChatTailMarker(html, minimumTailIndex);
  if (!marker) {
    return html;
  }
  return html.slice(0, marker.cropStart);
}

type TailMarker = {
  cropStart: number;
  index: number;
  kind: "block" | "engagement" | "end";
};

function findWeChatTailMarker(html: string, minimumTailIndex: number): TailMarker | null {
  const candidates = [
    ...findTailMarkerCandidates(html, /(?:一键三连|小心心|欢迎在评论区|评论区留下|点亮星标|科技前沿进展每日见|—\s*完\s*—|全文完|好文推荐|相关推荐)/gi, "block"),
    ...findTailMarkerCandidates(html, /(?:点赞.{0,32}转发|转发.{0,32}点赞)/gi, "engagement"),
    ...findTailMarkerCandidates(html, /\bEND\b/g, "end"),
  ].sort((left, right) => left.index - right.index);

  for (const candidate of candidates) {
    if (candidate.index < minimumTailIndex) {
      continue;
    }
    const cropStart = findBlockStart(html, candidate.index);
    const blockText = htmlToText(readBlockSnippet(html, cropStart, candidate.index));
    if (candidate.kind === "end" && blockText.trim() !== "END") {
      continue;
    }
    if (candidate.kind === "engagement" && blockText.length > 360) {
      continue;
    }
    return { ...candidate, cropStart };
  }

  return null;
}

function findTailMarkerCandidates(html: string, pattern: RegExp, kind: TailMarker["kind"]): TailMarker[] {
  return Array.from(html.matchAll(pattern)).map((match) => ({
    cropStart: match.index ?? 0,
    index: match.index ?? 0,
    kind,
  }));
}

function findBlockStart(html: string, markerIndex: number): number {
  const lowerHtml = html.toLowerCase();
  const blockStart = ["<p", "<section", "<div", "<blockquote"].reduce((nearest, token) => {
    const position = lowerHtml.lastIndexOf(token, markerIndex);
    return position > nearest ? position : nearest;
  }, -1);
  return blockStart >= 0 ? blockStart : markerIndex;
}

function readBlockSnippet(html: string, blockStart: number, markerIndex: number): string {
  const lowerHtml = html.toLowerCase();
  const nextBlockStart = ["<p", "<section", "<div", "<blockquote"]
    .map((token) => lowerHtml.indexOf(token, markerIndex + 1))
    .filter((position) => position >= 0)
    .sort((left, right) => left - right)[0];
  return html.slice(blockStart, nextBlockStart ?? Math.min(html.length, blockStart + 2000));
}

function normalizeImageTag(tag: string, baseUrl: string): string {
  const attributes = readAttributes(tag);
  const src = normalizeImageSource(
    attributes["data-src"] ??
      attributes["data-original"] ??
      attributes["data-backsrc"] ??
      attributes.src ??
      bestSrcSetCandidate(attributes.srcset) ??
      "",
    baseUrl,
  );
  if (!src) {
    return "";
  }

  const alt = normalizeImageAlt(attributes.alt ?? attributes.title ?? "文章配图");
  return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`;
}

function readAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = decodeHtml((match[2] ?? match[3] ?? match[4] ?? "").trim());
  }
  return attributes;
}

function bestSrcSetCandidate(value?: string): string {
  if (!value?.trim()) {
    return "";
  }
  const candidates = value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
  return candidates.at(-1) ?? "";
}

function normalizeImageSource(value: string, baseUrl: string): string {
  const src = value.trim();
  if (!src) {
    return "";
  }
  if (src.startsWith("//")) {
    return unwrapOptimizedImageUrl(`https:${src}`);
  }
  if (/^https?:\/\//i.test(src)) {
    return unwrapOptimizedImageUrl(src);
  }
  try {
    return unwrapOptimizedImageUrl(new URL(src, baseUrl).toString());
  } catch {
    return "";
  }
}

function unwrapOptimizedImageUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.pathname.endsWith("/_next/image")) {
      const original = url.searchParams.get("url");
      if (original) {
        return normalizeImageSource(original, url.origin);
      }
    }
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeImageAlt(value: string): string {
  const alt = value.trim();
  if (!alt || /^(?:https?:\/\/|www\.)/i.test(alt)) {
    return "文章配图";
  }
  return alt.slice(0, 80);
}

function extractMainContent(html: string): string {
  for (const pattern of [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]+class=["'][^"']*(?:article|post|content|entry)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  ]) {
    const match = html.match(pattern);
    if (match?.[1] && htmlToText(match[1]).length > 40) {
      return match[1];
    }
  }

  const paragraphs = Array.from(html.matchAll(/<p[^>]*>[\s\S]*?<\/p>/gi)).map((match) => match[0]);
  return paragraphs.join("\n");
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}

function inferSourceType(url: string): ArticleSourceType {
  if (!url || url.startsWith("local://")) {
    return "manual";
  }
  return /mp\.weixin\.qq\.com/i.test(url) ? "wechat" : "web";
}

function createParseRun(input: Omit<ArticleParseRun, "id" | "createdAt">): ArticleParseRun {
  return {
    id: createId("parse"),
    createdAt: nowIso(),
    ...input,
  };
}

function scoreQuality(title: string, contentText: string): number {
  const wordCount = countWords(contentText);
  let score = 0;
  if (title.trim()) {
    score += 20;
  }
  score += Math.min(60, Math.floor(wordCount / 4));
  if (contentText.includes("架构") || /agent|model|eval|system|production/i.test(contentText)) {
    score += 15;
  }
  return Math.max(0, Math.min(100, score));
}

function countWords(value: string): number {
  return value.replace(/\s+/g, "").length;
}

function hostnameFromUrl(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function timestampToDate(value: string): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return "";
  }
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}
