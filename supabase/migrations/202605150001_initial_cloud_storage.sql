create table if not exists workspaces (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into workspaces (id, name)
values ('default', 'Default Workspace')
on conflict (id) do nothing;

create table if not exists articles (
  id text primary key,
  workspace_id text not null default 'default' references workspaces(id) on delete cascade,
  title text not null,
  source_type text not null default 'wechat' check (source_type in ('web', 'wechat', 'manual')),
  source_name text not null default '',
  source_project text not null default '',
  source_account text not null default '',
  original_url text not null,
  author text not null default '',
  published_at text not null default '',
  content_html text not null default '',
  content_text text not null default '',
  content text not null default '',
  category text not null default '未分类',
  is_favorite boolean not null default false,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (workspace_id, original_url)
);

create table if not exists analysis_runs (
  id text primary key,
  workspace_id text not null default 'default' references workspaces(id) on delete cascade,
  article_id text not null references articles(id) on delete cascade,
  template_id text not null,
  template_name text not null,
  lens text not null,
  summary text not null,
  technical_insights jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  reusable_angles jsonb not null default '[]'::jsonb,
  viral_score jsonb not null,
  topic_candidates jsonb not null default '[]'::jsonb,
  model_metadata jsonb not null,
  created_at timestamptz not null
);

create table if not exists topic_candidates (
  id text primary key,
  workspace_id text not null default 'default' references workspaces(id) on delete cascade,
  analysis_run_id text not null references analysis_runs(id) on delete cascade,
  title text not null,
  hook text not null,
  target_reader text not null,
  angle text not null,
  evidence_article_ids jsonb not null default '[]'::jsonb,
  viral_score integer not null check (viral_score >= 0 and viral_score <= 100),
  status text not null default 'new' check (status in ('new', 'selected', 'drafted', 'archived')),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists drafts (
  id text primary key,
  workspace_id text not null default 'default' references workspaces(id) on delete cascade,
  title text not null,
  body text not null,
  source_analysis_ids jsonb not null default '[]'::jsonb,
  source_article_ids jsonb not null default '[]'::jsonb,
  content_channel text not null default 'wechat' check (content_channel in ('wechat', 'xiaohongshu')),
  publish_status text not null default 'draft' check (publish_status in ('draft', 'queued', 'published', 'archived')),
  planned_publish_at text not null default '',
  published_at text not null default '',
  queue_order integer not null default 0,
  notes text not null default '',
  export_format text not null default 'markdown' check (export_format in ('markdown', 'html')),
  wechat_draft_status text not null default 'not_sent' check (wechat_draft_status in ('not_sent', 'sent', 'failed')),
  wechat_media_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists assets (
  id text primary key,
  workspace_id text not null default 'default' references workspaces(id) on delete cascade,
  kind text not null default 'image' check (kind in ('image')),
  source_type text not null check (source_type in ('imported-article', 'generated-draft')),
  status text not null check (status in ('uploading', 'stored', 'failed')),
  original_url text not null default '',
  object_key text not null default '',
  public_path text not null default '',
  sha256 text not null default '',
  mime_type text not null default '',
  byte_size bigint not null default 0,
  width integer,
  height integer,
  prompt text not null default '',
  revised_prompt text not null default '',
  alt text not null default '',
  caption text not null default '',
  model text not null default '',
  error text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists asset_links (
  id text primary key,
  workspace_id text not null default 'default' references workspaces(id) on delete cascade,
  asset_id text not null references assets(id) on delete cascade,
  target_type text not null check (target_type in ('article', 'draft', 'analysis_run')),
  target_id text not null,
  role text not null check (role in ('source-image', 'hero', 'explanation')),
  sort_order integer not null default 0,
  caption text not null default '',
  created_at timestamptz not null
);

create table if not exists draft_image_assets (
  id text primary key,
  workspace_id text not null default 'default' references workspaces(id) on delete cascade,
  draft_id text not null references drafts(id) on delete cascade,
  asset_id text references assets(id) on delete set null,
  role text not null check (role in ('hero', 'explanation')),
  status text not null check (status in ('pending', 'generated', 'failed')),
  local_path text not null default '',
  public_path text not null default '',
  prompt text not null,
  revised_prompt text not null default '',
  alt text not null default '',
  caption text not null default '',
  model text not null,
  size text not null,
  error text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists article_parse_runs (
  id text primary key,
  workspace_id text not null default 'default' references workspaces(id) on delete cascade,
  article_id text references articles(id) on delete set null,
  url text not null,
  status text not null check (status in ('parsed', 'fallback', 'failed')),
  strategy text not null check (strategy in ('wechat', 'generic-web', 'manual')),
  quality_score integer not null check (quality_score >= 0 and quality_score <= 100),
  metadata jsonb not null default '{}'::jsonb,
  fallback_reason text not null default '',
  created_at timestamptz not null
);

create table if not exists content_agent_runs (
  id text primary key,
  workspace_id text not null default 'default' references workspaces(id) on delete cascade,
  article_id text not null references articles(id) on delete cascade,
  status text not null check (status in ('completed', 'failed')),
  steps jsonb not null default '[]'::jsonb,
  article_type text not null,
  quality_score integer not null check (quality_score >= 0 and quality_score <= 100),
  recommended_template_ids jsonb not null default '[]'::jsonb,
  recommended_action text not null check (recommended_action in ('analyze', 'generate-draft', 'supplement', 'archive')),
  reasoning_summary text not null default '',
  created_at timestamptz not null
);

create table if not exists settings (
  workspace_id text not null default 'default' references workspaces(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null,
  primary key (workspace_id, key)
);

create index if not exists idx_articles_workspace_updated_at on articles (workspace_id, updated_at desc);
create index if not exists idx_articles_workspace_category on articles (workspace_id, category, updated_at desc);
create index if not exists idx_articles_workspace_favorite on articles (workspace_id, is_favorite, updated_at desc);
create index if not exists idx_articles_workspace_source_project on articles (workspace_id, source_project, updated_at desc);
create index if not exists idx_analysis_runs_article_id on analysis_runs (article_id);
create index if not exists idx_topic_candidates_analysis_run_id on topic_candidates (analysis_run_id);
create index if not exists idx_topic_candidates_workspace_status on topic_candidates (workspace_id, status);
create index if not exists idx_drafts_workspace_updated_at on drafts (workspace_id, updated_at desc);
create index if not exists idx_drafts_workspace_channel_queue on drafts (workspace_id, content_channel, publish_status, queue_order, updated_at desc);
create index if not exists idx_assets_workspace_status on assets (workspace_id, status);
create unique index if not exists idx_assets_workspace_sha256_unique on assets (workspace_id, sha256) where sha256 <> '';
create index if not exists idx_asset_links_asset_id on asset_links (asset_id);
create index if not exists idx_asset_links_target on asset_links (target_type, target_id);
create index if not exists idx_draft_image_assets_draft_id on draft_image_assets (draft_id);
create index if not exists idx_draft_image_assets_asset_id on draft_image_assets (asset_id);
create index if not exists idx_article_parse_runs_article_id on article_parse_runs (article_id);
create index if not exists idx_content_agent_runs_article_id on content_agent_runs (article_id);

alter table workspaces enable row level security;
alter table articles enable row level security;
alter table analysis_runs enable row level security;
alter table topic_candidates enable row level security;
alter table drafts enable row level security;
alter table assets enable row level security;
alter table asset_links enable row level security;
alter table draft_image_assets enable row level security;
alter table article_parse_runs enable row level security;
alter table content_agent_runs enable row level security;
alter table settings enable row level security;
