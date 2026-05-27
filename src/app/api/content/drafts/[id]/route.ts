import { errorJson, stores } from "@/app/api/_helpers";
import type { ContentChannel, PublishStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { draftStore } = stores();
    const draft = await draftStore.updateDraft(id, {
      title: optionalString(payload.title),
      body: optionalString(payload.body),
      sourceAnalysisIds: optionalStringArray(payload.sourceAnalysisIds),
      sourceArticleIds: optionalStringArray(payload.sourceArticleIds),
      contentChannel: optionalChannel(payload.contentChannel),
      publishStatus: optionalStatus(payload.publishStatus),
      plannedPublishAt: optionalString(payload.plannedPublishAt),
      publishedAt: optionalString(payload.publishedAt),
      queueOrder: optionalNumber(payload.queueOrder),
      notes: optionalString(payload.notes),
      exportFormat: payload.exportFormat === "markdown" || payload.exportFormat === "html" ? payload.exportFormat : undefined,
    });
    if (!draft) {
      return Response.json({ error: "本地文章不存在" }, { status: 404 });
    }
    return Response.json({ draft });
  } catch (error) {
    return errorJson(error);
  }
}

function optionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : String(value ?? "").trim();
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function optionalChannel(value: unknown): ContentChannel | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value === "xiaohongshu" ? "xiaohongshu" : "wechat";
}

function optionalStatus(value: unknown): PublishStatus | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value === "queued" || value === "published" || value === "archived" ? value : "draft";
}
