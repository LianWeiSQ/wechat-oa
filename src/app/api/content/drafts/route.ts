import { errorJson, stores } from "@/app/api/_helpers";
import type { ContentChannel, PublishStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const channel = normalizeChannelQuery(url.searchParams.get("channel"));
  const status = normalizeStatusQuery(url.searchParams.get("status"));
  const { draftStore } = stores();
  return Response.json({ drafts: await draftStore.listDrafts({ channel, status }) });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { draftStore } = stores();
    const draft = await draftStore.createDraft({
      title: String(payload.title ?? "").trim(),
      body: String(payload.body ?? "").trim(),
      sourceAnalysisIds: stringArray(payload.sourceAnalysisIds),
      sourceArticleIds: stringArray(payload.sourceArticleIds),
      contentChannel: normalizeChannel(payload.contentChannel),
      publishStatus: normalizeStatus(payload.publishStatus),
      plannedPublishAt: stringValue(payload.plannedPublishAt),
      publishedAt: stringValue(payload.publishedAt),
      queueOrder: typeof payload.queueOrder === "number" ? payload.queueOrder : undefined,
      notes: stringValue(payload.notes),
      exportFormat: payload.exportFormat === "markdown" ? "markdown" : "html",
    });
    return Response.json({ draft });
  } catch (error) {
    return errorJson(error);
  }
}

function normalizeChannelQuery(value: string | null): ContentChannel | "all" {
  if (value === "all") {
    return "all";
  }
  return normalizeChannel(value);
}

function normalizeStatusQuery(value: string | null): PublishStatus | "all" {
  if (value === "all") {
    return "all";
  }
  return normalizeStatus(value);
}

function normalizeChannel(value: unknown): ContentChannel {
  return value === "xiaohongshu" ? "xiaohongshu" : "wechat";
}

function normalizeStatus(value: unknown): PublishStatus {
  return value === "queued" || value === "published" || value === "archived" ? value : "draft";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}
