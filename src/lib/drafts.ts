import type { DatabaseSync } from "node:sqlite";
import { stripHtml } from "@/lib/analysis";
import { createId, nowIso } from "@/lib/ids";
import type { AnalysisRun, LocalDraft } from "@/lib/types";

type DraftRow = {
  id: string;
  title: string;
  body: string;
  source_analysis_ids_json: string;
  export_format: LocalDraft["exportFormat"];
  wechat_draft_status: LocalDraft["wechatDraftStatus"];
  wechat_media_id?: string;
  created_at: string;
  updated_at: string;
};

export function createDraftStore(db: DatabaseSync) {
  return {
    createDraft(input: Pick<LocalDraft, "title" | "body" | "sourceAnalysisIds" | "exportFormat">): LocalDraft {
      const timestamp = nowIso();
      const draft: LocalDraft = {
        id: createId("draft"),
        title: input.title.trim(),
        body: input.body.trim(),
        sourceAnalysisIds: input.sourceAnalysisIds,
        exportFormat: input.exportFormat,
        wechatDraftStatus: "not_sent",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.prepare(`
        INSERT INTO drafts (
          id, title, body, source_analysis_ids_json, export_format,
          wechat_draft_status, wechat_media_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        draft.id,
        draft.title,
        draft.body,
        JSON.stringify(draft.sourceAnalysisIds),
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
      db.prepare(`
        UPDATE drafts
        SET body = ?, updated_at = ?
        WHERE id = ?
      `).run(body.trim(), nowIso(), id);
      return this.getDraft(id);
    },

    listDrafts(): LocalDraft[] {
      return (db.prepare("SELECT * FROM drafts ORDER BY updated_at DESC").all() as DraftRow[]).map(mapDraft);
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
    exportFormat: row.export_format,
    wechatDraftStatus: row.wechat_draft_status,
    wechatMediaId: row.wechat_media_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
