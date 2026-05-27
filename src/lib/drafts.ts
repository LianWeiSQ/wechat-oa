import type { DatabaseSync } from "node:sqlite";
import { stripHtml } from "@/lib/analysis";
import { createId, nowIso } from "@/lib/ids";
import type { AnalysisRun, ContentChannel, LocalDraft, PublishStatus } from "@/lib/types";

type DraftRow = {
  id: string;
  title: string;
  body: string;
  source_analysis_ids_json: string;
  source_article_ids_json: string;
  content_channel: ContentChannel;
  publish_status: PublishStatus;
  planned_publish_at: string;
  published_at: string;
  queue_order: number;
  notes: string;
  export_format: LocalDraft["exportFormat"];
  wechat_draft_status: LocalDraft["wechatDraftStatus"];
  wechat_media_id?: string;
  created_at: string;
  updated_at: string;
};

export type DraftCreateInput = Pick<LocalDraft, "title" | "body" | "sourceAnalysisIds" | "exportFormat"> &
  Partial<Pick<LocalDraft, "sourceArticleIds" | "contentChannel" | "publishStatus" | "plannedPublishAt" | "publishedAt" | "queueOrder" | "notes">>;

export type DraftUpdateInput = Partial<
  Pick<
    LocalDraft,
    | "title"
    | "body"
    | "sourceAnalysisIds"
    | "sourceArticleIds"
    | "contentChannel"
    | "publishStatus"
    | "plannedPublishAt"
    | "publishedAt"
    | "queueOrder"
    | "notes"
    | "exportFormat"
  >
>;

export type DraftListQuery = {
  channel?: ContentChannel | "all";
  status?: PublishStatus | "all";
};

export function createDraftStore(db: DatabaseSync) {
  return {
    createDraft(input: DraftCreateInput): LocalDraft {
      const timestamp = nowIso();
      const contentChannel = normalizeContentChannel(input.contentChannel);
      const publishStatus = normalizePublishStatus(input.publishStatus);
      const plannedPublishAt = normalizeOptionalIso(input.plannedPublishAt);
      const publishedAt = publishStatus === "published" ? normalizeOptionalIso(input.publishedAt) || timestamp : normalizeOptionalIso(input.publishedAt);
      const draft: LocalDraft = {
        id: createId("draft"),
        title: input.title.trim(),
        body: input.body.trim(),
        sourceAnalysisIds: normalizeIds(input.sourceAnalysisIds),
        sourceArticleIds: normalizeIds(input.sourceArticleIds ?? []),
        contentChannel,
        publishStatus,
        plannedPublishAt,
        publishedAt,
        queueOrder: normalizeQueueOrder(input.queueOrder, nextQueueOrder(db, contentChannel)),
        notes: input.notes?.trim() ?? "",
        exportFormat: input.exportFormat,
        wechatDraftStatus: "not_sent",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.prepare(`
        INSERT INTO drafts (
          id, title, body, source_analysis_ids_json, source_article_ids_json,
          content_channel, publish_status, planned_publish_at, published_at, queue_order, notes, export_format,
          wechat_draft_status, wechat_media_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        draft.id,
        draft.title,
        draft.body,
        JSON.stringify(draft.sourceAnalysisIds),
        JSON.stringify(draft.sourceArticleIds ?? []),
        draft.contentChannel,
        draft.publishStatus,
        draft.plannedPublishAt ?? "",
        draft.publishedAt ?? "",
        draft.queueOrder ?? 0,
        draft.notes ?? "",
        draft.exportFormat,
        draft.wechatDraftStatus,
        draft.wechatMediaId ?? null,
        draft.createdAt,
        draft.updatedAt,
      );
      return draft;
    },

    createDraftFromAnalysis(run: AnalysisRun): LocalDraft {
      const topCandidate = [...run.topicCandidates].sort((a, b) => b.viralScore - a.viralScore)[0];
      const title = topCandidate?.title ?? `${run.templateName}：${run.summary.slice(0, 24)}`;
      const body = [
        `<h1>${escapeHtml(title)}</h1>`,
        `<p><strong>开头钩子：</strong>${escapeHtml(topCandidate?.hook ?? run.summary)}</p>`,
        `<h2>核心判断</h2>`,
        `<p>${escapeHtml(run.summary)}</p>`,
        `<h2>技术要点</h2>`,
        `<ul>${run.technicalInsights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
        `<h2>风险与反方问题</h2>`,
        `<ul>${run.risks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
      ].join("\n");
      return this.createDraft({
        title,
        body,
        sourceAnalysisIds: [run.id],
        exportFormat: "html",
      });
    },

    getDraft(id: string): LocalDraft | null {
      const row = db.prepare("SELECT * FROM drafts WHERE id = ?").get(id) as DraftRow | undefined;
      return row ? mapDraft(row) : null;
    },

    updateDraftBody(id: string, body: string): LocalDraft | null {
      return this.updateDraft(id, { body });
    },

    updateDraft(id: string, input: DraftUpdateInput): LocalDraft | null {
      const existing = this.getDraft(id);
      if (!existing) {
        return null;
      }
      const timestamp = nowIso();
      const contentChannel = normalizeContentChannel(input.contentChannel ?? existing.contentChannel);
      const publishStatus = normalizePublishStatus(input.publishStatus ?? existing.publishStatus);
      const explicitPublishedAt = input.publishedAt !== undefined;
      const publishedAt =
        publishStatus === "published"
          ? normalizeOptionalIso(input.publishedAt ?? existing.publishedAt) || timestamp
          : explicitPublishedAt
            ? normalizeOptionalIso(input.publishedAt)
            : publishStatus === existing.publishStatus
              ? existing.publishedAt ?? ""
              : "";
      const queueOrder =
        input.queueOrder === undefined
          ? existing.queueOrder ?? nextQueueOrder(db, contentChannel)
          : normalizeQueueOrder(input.queueOrder, existing.queueOrder ?? 0);

      db.prepare(`
        UPDATE drafts
        SET title = ?, body = ?, source_analysis_ids_json = ?, source_article_ids_json = ?,
            content_channel = ?, publish_status = ?, planned_publish_at = ?, published_at = ?,
            queue_order = ?, notes = ?, export_format = ?, updated_at = ?
        WHERE id = ?
      `).run(
        input.title?.trim() || existing.title,
        input.body === undefined ? existing.body : input.body.trim(),
        JSON.stringify(normalizeIds(input.sourceAnalysisIds ?? existing.sourceAnalysisIds)),
        JSON.stringify(normalizeIds(input.sourceArticleIds ?? existing.sourceArticleIds ?? [])),
        contentChannel,
        publishStatus,
        normalizeOptionalIso(input.plannedPublishAt ?? existing.plannedPublishAt),
        publishedAt,
        queueOrder,
        input.notes === undefined ? existing.notes ?? "" : input.notes.trim(),
        normalizeExportFormat(input.exportFormat ?? existing.exportFormat),
        timestamp,
        id,
      );
      return this.getDraft(id);
    },

    listDrafts(query: DraftListQuery = {}): LocalDraft[] {
      const rows = db
        .prepare(
          `
            SELECT * FROM drafts
            ORDER BY
              CASE publish_status
                WHEN 'queued' THEN 0
                WHEN 'draft' THEN 1
                WHEN 'published' THEN 2
                ELSE 3
              END,
              queue_order ASC,
              updated_at DESC
          `,
        )
        .all() as DraftRow[];
      return rows
        .map(mapDraft)
        .filter((draft) => !query.channel || query.channel === "all" || draft.contentChannel === query.channel)
        .filter((draft) => !query.status || query.status === "all" || draft.publishStatus === query.status);
    },

    markWeChatResult(id: string, status: LocalDraft["wechatDraftStatus"], mediaId?: string): LocalDraft | null {
      db.prepare(`
        UPDATE drafts
        SET wechat_draft_status = ?, wechat_media_id = ?, updated_at = ?
        WHERE id = ?
      `).run(status, mediaId ?? null, nowIso(), id);
      return this.getDraft(id);
    },
  };
}

export function exportDraft(draft: LocalDraft, format: "markdown" | "html" = draft.exportFormat): string {
  if (format === "html") {
    return draft.body;
  }
  return [
    `# ${draft.title}`,
    "",
    stripHtml(draft.body)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n\n"),
  ].join("\n");
}

function mapDraft(row: DraftRow): LocalDraft {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    sourceAnalysisIds: parseJson<string[]>(row.source_analysis_ids_json, []),
    sourceArticleIds: parseJson<string[]>(row.source_article_ids_json, []),
    contentChannel: normalizeContentChannel(row.content_channel),
    publishStatus: normalizePublishStatus(row.publish_status),
    plannedPublishAt: row.planned_publish_at,
    publishedAt: row.published_at,
    queueOrder: row.queue_order,
    notes: row.notes,
    exportFormat: row.export_format,
    wechatDraftStatus: row.wechat_draft_status,
    wechatMediaId: row.wechat_media_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeContentChannel(value: unknown): ContentChannel {
  return value === "xiaohongshu" ? "xiaohongshu" : "wechat";
}

export function normalizePublishStatus(value: unknown): PublishStatus {
  return value === "queued" || value === "published" || value === "archived" ? value : "draft";
}

function normalizeExportFormat(value: unknown): LocalDraft["exportFormat"] {
  return value === "markdown" ? "markdown" : "html";
}

function normalizeIds(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));
}

function normalizeQueueOrder(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : fallback;
}

function normalizeOptionalIso(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function nextQueueOrder(db: DatabaseSync, channel: ContentChannel): number {
  const row = db
    .prepare("SELECT COALESCE(MAX(queue_order), 0) + 1 AS next_order FROM drafts WHERE content_channel = ?")
    .get(channel) as { next_order?: number } | undefined;
  return row?.next_order ?? 1;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
