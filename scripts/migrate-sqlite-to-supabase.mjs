#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@supabase/supabase-js";

const workspaceId = process.env.WECHAT_OA_WORKSPACE_ID || "default";
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "wechat-oa-assets";
const dbPath = process.argv[2] || join(process.cwd(), "data", "wechat-oa.sqlite");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

if (!existsSync(dbPath)) {
  throw new Error(`SQLite database not found: ${dbPath}`);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = new DatabaseSync(dbPath, { readOnly: true });

await ensureWorkspace();
await migrateArticles();
await migrateAnalysisRuns();
await migrateTopicCandidates();
await migrateDrafts();
await migrateDraftImageAssets();
await migrateParseRuns();
await migrateContentAgentRuns();
await migrateSettings();

db.close();
console.log("SQLite -> Supabase migration complete.");

async function ensureWorkspace() {
  await upsert("workspaces", {
    id: workspaceId,
    name: workspaceId === "default" ? "Default Workspace" : workspaceId,
    updated_at: new Date().toISOString(),
  }, "id");
}

async function migrateArticles() {
  for (const row of all("select * from articles")) {
    await upsert("articles", {
      id: row.id,
      workspace_id: workspaceId,
      title: row.title,
      source_type: row.source_type || "wechat",
      source_name: row.source_name || row.source_account || "",
      source_account: row.source_account || row.source_name || "",
      original_url: row.original_url,
      author: row.author || "",
      published_at: row.published_at || "",
      content_html: row.content_html || row.content || "",
      content_text: row.content_text || row.content || "",
      content: row.content || row.content_html || row.content_text || "",
      category: row.category || "未分类",
      tags: parseJson(row.tags_json, []),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }, "id");
  }
}

async function migrateAnalysisRuns() {
  for (const row of all("select * from analysis_runs")) {
    await upsert("analysis_runs", {
      id: row.id,
      workspace_id: workspaceId,
      article_id: row.article_id,
      template_id: row.template_id,
      template_name: row.template_name,
      lens: row.lens,
      summary: row.summary,
      technical_insights: parseJson(row.technical_insights_json, []),
      risks: parseJson(row.risks_json, []),
      reusable_angles: parseJson(row.reusable_angles_json, []),
      viral_score: parseJson(row.viral_score_json, {}),
      topic_candidates: parseJson(row.topic_candidates_json, []),
      model_metadata: parseJson(row.model_metadata_json, {}),
      created_at: row.created_at,
    }, "id");
  }
}

async function migrateTopicCandidates() {
  for (const row of all("select * from topic_candidates")) {
    await upsert("topic_candidates", {
      id: row.id,
      workspace_id: workspaceId,
      analysis_run_id: row.analysis_run_id,
      title: row.title,
      hook: row.hook,
      target_reader: row.target_reader,
      angle: row.angle,
      evidence_article_ids: parseJson(row.evidence_article_ids_json, []),
      viral_score: row.viral_score,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }, "id");
  }
}

async function migrateDrafts() {
  for (const row of all("select * from drafts")) {
    await upsert("drafts", {
      id: row.id,
      workspace_id: workspaceId,
      title: row.title,
      body: row.body,
      source_analysis_ids: parseJson(row.source_analysis_ids_json, []),
      export_format: row.export_format,
      wechat_draft_status: row.wechat_draft_status,
      wechat_media_id: row.wechat_media_id || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }, "id");
  }
}

async function migrateDraftImageAssets() {
  for (const row of all("select * from draft_image_assets")) {
    const fileName = row.local_path ? basename(row.local_path) : "";
    const objectKey = fileName ? `workspaces/${workspaceId}/assets/${fileName}` : "";
    let sha256 = "";
    let byteSize = 0;
    if (row.status === "generated" && row.local_path && existsSync(row.local_path)) {
      const bytes = await readFile(row.local_path);
      sha256 = createHash("sha256").update(bytes).digest("hex");
      byteSize = bytes.byteLength;
      const upload = await supabase.storage.from(bucket).upload(objectKey, bytes, {
        contentType: "image/png",
        upsert: true,
      });
      if (upload.error) {
        console.warn(`Failed to upload ${row.local_path}: ${upload.error.message}`);
      }
    }

    const assetId = row.asset_id || `asset_${row.id}`;
    await upsert("assets", {
      id: assetId,
      workspace_id: workspaceId,
      kind: "image",
      source_type: "generated-draft",
      status: row.status === "generated" ? "stored" : "failed",
      original_url: "",
      object_key: objectKey || row.local_path || "",
      public_path: row.public_path || (fileName ? `/api/assets/images/${fileName}` : ""),
      sha256,
      mime_type: row.status === "generated" ? "image/png" : "",
      byte_size: byteSize,
      prompt: row.prompt,
      revised_prompt: row.revised_prompt || "",
      alt: row.alt || "",
      caption: row.caption || "",
      model: row.model || "",
      error: row.error || "",
      created_at: row.created_at,
      updated_at: row.updated_at,
    }, "id");

    await upsert("asset_links", {
      id: `link_${row.id}`,
      workspace_id: workspaceId,
      asset_id: assetId,
      target_type: "draft",
      target_id: row.draft_id,
      role: row.role,
      sort_order: 0,
      caption: row.caption || "",
      created_at: row.created_at,
    }, "id");

    await upsert("draft_image_assets", {
      id: row.id,
      workspace_id: workspaceId,
      draft_id: row.draft_id,
      asset_id: assetId,
      role: row.role,
      status: row.status,
      local_path: objectKey || row.local_path || "",
      public_path: row.public_path || (fileName ? `/api/assets/images/${fileName}` : ""),
      prompt: row.prompt,
      revised_prompt: row.revised_prompt || "",
      alt: row.alt || "",
      caption: row.caption || "",
      model: row.model || "",
      size: row.size,
      error: row.error || "",
      created_at: row.created_at,
      updated_at: row.updated_at,
    }, "id");
  }
}

async function migrateParseRuns() {
  for (const row of all("select * from article_parse_runs")) {
    await upsert("article_parse_runs", {
      id: row.id,
      workspace_id: workspaceId,
      article_id: row.article_id || null,
      url: row.url,
      status: row.status,
      strategy: row.strategy,
      quality_score: row.quality_score,
      metadata: parseJson(row.metadata_json, {}),
      fallback_reason: row.fallback_reason || "",
      created_at: row.created_at,
    }, "id");
  }
}

async function migrateContentAgentRuns() {
  for (const row of all("select * from content_agent_runs")) {
    await upsert("content_agent_runs", {
      id: row.id,
      workspace_id: workspaceId,
      article_id: row.article_id,
      status: row.status,
      steps: parseJson(row.steps_json, []),
      article_type: row.article_type,
      quality_score: row.quality_score,
      recommended_template_ids: parseJson(row.recommended_template_ids_json, []),
      recommended_action: row.recommended_action,
      reasoning_summary: row.reasoning_summary || "",
      created_at: row.created_at,
    }, "id");
  }
}

async function migrateSettings() {
  for (const row of all("select * from settings")) {
    await upsert("settings", {
      workspace_id: workspaceId,
      key: row.key,
      value: parseJson(row.value_json, {}),
      updated_at: row.updated_at,
    }, "workspace_id,key");
  }
}

function all(sql) {
  try {
    return db.prepare(sql).all();
  } catch (error) {
    if (String(error).includes("no such table")) {
      return [];
    }
    throw error;
  }
}

async function upsert(table, row, onConflict) {
  const { error } = await supabase.from(table).upsert(row, { onConflict });
  if (error) {
    throw new Error(`Failed to upsert ${table}: ${error.message}`);
  }
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
