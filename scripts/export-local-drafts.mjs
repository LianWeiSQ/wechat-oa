import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = process.env.WECHAT_OA_DB_PATH ?? join(workspaceRoot, "data", "wechat-oa.sqlite");
const outputRoot = join(workspaceRoot, "exports", "本地创作文章");
const channelDirs = {
  wechat: "公众号",
  xiaohongshu: "小红书",
};

exportLocalDrafts();

function exportLocalDrafts() {
  mkdirSync(outputRoot, { recursive: true });
  for (const dirName of Object.values(channelDirs)) {
    const targetDir = join(outputRoot, dirName);
    mkdirSync(targetDir, { recursive: true });
    for (const file of readdirSync(targetDir)) {
      if (file.endsWith(".md")) {
        rmSync(join(targetDir, file));
      }
    }
  }

  const db = new DatabaseSync(dbPath);
  const drafts = db.prepare(`
    SELECT id, title, body, source_analysis_ids_json, source_article_ids_json,
           content_channel, publish_status, planned_publish_at, published_at,
           queue_order, notes, export_format, wechat_draft_status, wechat_media_id,
           created_at, updated_at
    FROM drafts
    ORDER BY content_channel ASC, created_at ASC
  `).all();
  db.close();

  const indexByChannel = new Map();
  for (const draft of drafts) {
    const channel = draft.content_channel === "xiaohongshu" ? "xiaohongshu" : "wechat";
    const channelItems = indexByChannel.get(channel) ?? [];
    const sequence = String(channelItems.length + 1).padStart(2, "0");
    const fileName = `${sequence}-${slugTitle(draft.title)}.md`;
    const relativePath = `${channelDirs[channel]}/${fileName}`;
    writeFileSync(join(outputRoot, relativePath), createDraftMarkdown(draft, channel), "utf8");
    channelItems.push({
      id: draft.id,
      relativePath,
      status: statusLabel(draft.publish_status),
      title: draft.title,
    });
    indexByChannel.set(channel, channelItems);
  }

  writeFileSync(join(outputRoot, "README.md"), createReadme(indexByChannel), "utf8");
  console.log(`Exported ${drafts.length} local drafts to exports/本地创作文章`);
}

function createDraftMarkdown(draft, channel) {
  const metadata = [
    "类型：本地创作文章",
    `平台：${channelLabel(channel)}`,
    `状态：${statusLabel(draft.publish_status)}`,
    `草稿 ID：${draft.id}`,
    `创建时间：${draft.created_at}`,
    `更新时间：${draft.updated_at}`,
    draft.planned_publish_at ? `计划发布时间：${draft.planned_publish_at}` : "",
    draft.published_at ? `实际发布时间：${draft.published_at}` : "",
    draft.wechat_draft_status ? `微信草稿状态：${draft.wechat_draft_status}` : "",
    draft.wechat_media_id ? `微信 media_id：${draft.wechat_media_id}` : "",
  ].filter(Boolean);

  return [
    `# ${draft.title}`,
    "",
    "---",
    ...metadata,
    "---",
    "",
    htmlToMarkdown(draft.body),
    "",
  ].join("\n");
}

function createReadme(indexByChannel) {
  const wechatItems = indexByChannel.get("wechat") ?? [];
  const xiaohongshuItems = indexByChannel.get("xiaohongshu") ?? [];
  return [
    "# 本地创作文章",
    "",
    "这里统一保存系统在本地生成、排期或准备发布的文章，全部使用 `.md` 结尾。",
    "",
    "和 `外部引用素材` 区分：复制链接导入的文章是参考素材；这里的文章是我们自己要发的本地创作稿。",
    "",
    "## 公众号",
    "",
    ...wechatItems.map((item) => `- [${item.title}](./${item.relativePath}) - ${item.status} - ${item.id}`),
    "",
    "## 小红书",
    "",
    ...(xiaohongshuItems.length > 0
      ? xiaohongshuItems.map((item) => `- [${item.title}](./${item.relativePath}) - ${item.status} - ${item.id}`)
      : ["暂无从数据库导出的本地小红书文章。"]),
    "",
    "## 现有历史导出位置",
    "",
    "- 公众号历史导出：`exports/wechat-drafts/`",
    "- 公众号系列文章：`exports/wechat-official-account-series/`",
    "- 小红书历史笔记：`exports/xiaohongshu-notes/`",
    "- 专题项目稿件：`exports/wechat-article-campaigns/`",
    "- 资料包/引流资料：`exports/lead-magnets/`",
    "",
  ].join("\n");
}

function htmlToMarkdown(html) {
  let text = String(html ?? "").trim();
  if (!/<[a-z][\s\S]*>/i.test(text)) {
    return text;
  }

  text = text
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, (_, content) => `# ${stripTags(content)}\n\n`)
    .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, (_, content) => `## ${stripTags(content)}\n\n`)
    .replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, (_, content) => `### ${stripTags(content)}\n\n`)
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => `> ${stripTags(content)}\n\n`)
    .replace(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi, (_, content) => `${convertImages(content)}${stripTags(content.replace(/<img\b[^>]*>/gi, ""))}\n\n`)
    .replace(/<img\b([^>]*)>/gi, (_, attributes) => imageMarkdown(attributes))
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, content) => `- ${stripTags(content)}\n`)
    .replace(/<\/ul>|<\/ol>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_, content) => `${stripTags(content)}\n\n`)
    .replace(/<div\b[^>]*>([\s\S]*?)<\/div>/gi, (_, content) => `${stripTags(content)}\n\n`)
    .replace(/<[^>]+>/g, "");

  return decodeHtml(text)
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function convertImages(html) {
  return Array.from(String(html).matchAll(/<img\b([^>]*)>/gi))
    .map((match) => imageMarkdown(match[1]))
    .join("\n");
}

function imageMarkdown(attributes) {
  const src = readAttribute(attributes, "src") || readAttribute(attributes, "data-src");
  if (!src || /^javascript:/i.test(src)) {
    return "";
  }
  const alt = readAttribute(attributes, "alt") || "文章配图";
  return `![${alt}](${src})\n\n`;
}

function readAttribute(attributes, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = String(attributes ?? "").match(pattern);
  return decodeHtml((match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim());
}

function stripTags(value) {
  return decodeHtml(String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function slugTitle(title) {
  const slug = String(title ?? "未命名文章")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/[\s，。、“”‘’！？：；（）()[\]{}]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return slug || "未命名文章";
}

function channelLabel(channel) {
  return channel === "xiaohongshu" ? "小红书" : "公众号";
}

function statusLabel(status) {
  return {
    draft: "草稿",
    queued: "待发布",
    published: "已发布",
    archived: "归档",
  }[status] ?? status ?? "草稿";
}
