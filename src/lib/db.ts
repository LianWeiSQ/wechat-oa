import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

let appDatabase: DatabaseSync | null = null;

export function getDatabasePath(): string {
  return process.env.WECHAT_OA_DB_PATH ?? join(process.cwd(), "data", "wechat-oa.sqlite");
}

export function openDatabase(path = getDatabasePath()): DatabaseSync {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

export function getAppDatabase(): DatabaseSync {
  if (!appDatabase) {
    appDatabase = openDatabase();
  }
  return appDatabase;
}

export function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'wechat',
      source_name TEXT NOT NULL DEFAULT '',
      source_project TEXT NOT NULL DEFAULT '',
      source_account TEXT NOT NULL,
      original_url TEXT NOT NULL UNIQUE,
      author TEXT NOT NULL DEFAULT '',
      published_at TEXT NOT NULL DEFAULT '',
      content_html TEXT NOT NULL DEFAULT '',
      content_text TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '未分类',
      is_favorite INTEGER NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analysis_runs (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      template_name TEXT NOT NULL,
      lens TEXT NOT NULL,
      summary TEXT NOT NULL,
      technical_insights_json TEXT NOT NULL DEFAULT '[]',
      risks_json TEXT NOT NULL DEFAULT '[]',
      reusable_angles_json TEXT NOT NULL DEFAULT '[]',
      viral_score_json TEXT NOT NULL,
      topic_candidates_json TEXT NOT NULL DEFAULT '[]',
      model_metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS topic_candidates (
      id TEXT PRIMARY KEY,
      analysis_run_id TEXT NOT NULL,
      title TEXT NOT NULL,
      hook TEXT NOT NULL,
      target_reader TEXT NOT NULL,
      angle TEXT NOT NULL,
      evidence_article_ids_json TEXT NOT NULL DEFAULT '[]',
      viral_score INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (analysis_run_id) REFERENCES analysis_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      source_analysis_ids_json TEXT NOT NULL DEFAULT '[]',
      source_article_ids_json TEXT NOT NULL DEFAULT '[]',
      content_channel TEXT NOT NULL DEFAULT 'wechat',
      publish_status TEXT NOT NULL DEFAULT 'draft',
      planned_publish_at TEXT NOT NULL DEFAULT '',
      published_at TEXT NOT NULL DEFAULT '',
      queue_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      export_format TEXT NOT NULL DEFAULT 'markdown',
      wechat_draft_status TEXT NOT NULL DEFAULT 'not_sent',
      wechat_media_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_article_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      schedule_type TEXT NOT NULL DEFAULT 'once',
      scheduled_at TEXT NOT NULL,
      next_run_at TEXT NOT NULL,
      last_run_at TEXT NOT NULL DEFAULT '',
      input_json TEXT NOT NULL,
      draft_id TEXT,
      error TEXT NOT NULL DEFAULT '',
      run_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_article_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL DEFAULT '',
      draft_id TEXT,
      message TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (task_id) REFERENCES scheduled_article_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS draft_image_assets (
      id TEXT PRIMARY KEY,
      draft_id TEXT NOT NULL,
      asset_id TEXT,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      local_path TEXT NOT NULL DEFAULT '',
      public_path TEXT NOT NULL DEFAULT '',
      prompt TEXT NOT NULL,
      revised_prompt TEXT NOT NULL DEFAULT '',
      alt TEXT NOT NULL DEFAULT '',
      caption TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL,
      size TEXT NOT NULL,
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      kind TEXT NOT NULL DEFAULT 'image',
      source_type TEXT NOT NULL,
      status TEXT NOT NULL,
      original_url TEXT NOT NULL DEFAULT '',
      object_key TEXT NOT NULL DEFAULT '',
      public_path TEXT NOT NULL DEFAULT '',
      sha256 TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT '',
      byte_size INTEGER NOT NULL DEFAULT 0,
      width INTEGER,
      height INTEGER,
      prompt TEXT NOT NULL DEFAULT '',
      revised_prompt TEXT NOT NULL DEFAULT '',
      alt TEXT NOT NULL DEFAULT '',
      caption TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_links (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      asset_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      role TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      caption TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS article_parse_runs (
      id TEXT PRIMARY KEY,
      article_id TEXT,
      url TEXT NOT NULL,
      status TEXT NOT NULL,
      strategy TEXT NOT NULL,
      quality_score INTEGER NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      fallback_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS content_agent_runs (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      status TEXT NOT NULL,
      steps_json TEXT NOT NULL DEFAULT '[]',
      article_type TEXT NOT NULL,
      quality_score INTEGER NOT NULL,
      recommended_template_ids_json TEXT NOT NULL DEFAULT '[]',
      recommended_action TEXT NOT NULL,
      reasoning_summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS writing_structure_runs (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      structure_json TEXT NOT NULL,
      quality_score INTEGER NOT NULL,
      model_metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS writing_blueprints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_article_ids_json TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL,
      section_plan_json TEXT NOT NULL DEFAULT '[]',
      tone_rules_json TEXT NOT NULL DEFAULT '[]',
      banned_expressions_json TEXT NOT NULL DEFAULT '[]',
      model_metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_articles_updated_at ON articles(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_analysis_runs_article_id ON analysis_runs(article_id);
    CREATE INDEX IF NOT EXISTS idx_topic_candidates_status ON topic_candidates(status);
    CREATE INDEX IF NOT EXISTS idx_scheduled_article_tasks_due ON scheduled_article_tasks(status, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_scheduled_article_runs_task_id ON scheduled_article_runs(task_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_draft_image_assets_draft_id ON draft_image_assets(draft_id);
    CREATE INDEX IF NOT EXISTS idx_assets_sha256 ON assets(workspace_id, sha256);
    CREATE INDEX IF NOT EXISTS idx_asset_links_target ON asset_links(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_article_parse_runs_article_id ON article_parse_runs(article_id);
    CREATE INDEX IF NOT EXISTS idx_content_agent_runs_article_id ON content_agent_runs(article_id);
    CREATE INDEX IF NOT EXISTS idx_writing_structure_runs_article_id ON writing_structure_runs(article_id);
    CREATE INDEX IF NOT EXISTS idx_writing_blueprints_updated_at ON writing_blueprints(updated_at DESC);
  `);
  ensureColumn(db, "articles", "source_type", "TEXT NOT NULL DEFAULT 'wechat'");
  ensureColumn(db, "articles", "source_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "articles", "source_project", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "articles", "content_html", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "articles", "content_text", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "articles", "category", "TEXT NOT NULL DEFAULT '未分类'");
  ensureColumn(db, "articles", "is_favorite", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "draft_image_assets", "asset_id", "TEXT");
  ensureColumn(db, "drafts", "source_article_ids_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "drafts", "content_channel", "TEXT NOT NULL DEFAULT 'wechat'");
  ensureColumn(db, "drafts", "publish_status", "TEXT NOT NULL DEFAULT 'draft'");
  ensureColumn(db, "drafts", "planned_publish_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drafts", "published_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "drafts", "queue_order", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "drafts", "notes", "TEXT NOT NULL DEFAULT ''");
  db.exec("CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category, updated_at DESC);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_articles_favorite ON articles(is_favorite, updated_at DESC);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_articles_source_project ON articles(source_project, updated_at DESC);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_drafts_channel_queue ON drafts(content_channel, publish_status, queue_order, updated_at DESC);");
  db.exec(`
    UPDATE articles
    SET source_name = source_account
    WHERE source_name = '';

    UPDATE articles
    SET source_project = source_name
    WHERE source_project = '';

    UPDATE articles
    SET content_html = content
    WHERE content_html = '';

    UPDATE articles
    SET content_text = content
    WHERE content_text = '';

    UPDATE drafts
    SET publish_status = 'published'
    WHERE publish_status = 'draft' AND wechat_draft_status = 'sent';
  `);
  db.exec(`
    WITH ranked_drafts AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY content_channel
          ORDER BY
            CASE publish_status
              WHEN 'queued' THEN 0
              WHEN 'draft' THEN 1
              WHEN 'published' THEN 2
              ELSE 3
            END,
            CASE WHEN queue_order > 0 THEN queue_order ELSE 2147483647 END,
            updated_at DESC,
            id ASC
        ) AS normalized_order
      FROM drafts
    )
    UPDATE drafts
    SET queue_order = (
      SELECT normalized_order
      FROM ranked_drafts
      WHERE ranked_drafts.id = drafts.id
    )
    WHERE queue_order <= 0;
  `);
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}
