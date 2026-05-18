create table if not exists writing_structure_runs (
  id text primary key,
  workspace_id text not null default 'default' references workspaces(id) on delete cascade,
  article_id text not null references articles(id) on delete cascade,
  structure jsonb not null,
  quality_score integer not null check (quality_score >= 0 and quality_score <= 100),
  model_metadata jsonb not null,
  created_at timestamptz not null
);

create table if not exists writing_blueprints (
  id text primary key,
  workspace_id text not null default 'default' references workspaces(id) on delete cascade,
  name text not null,
  source_article_ids jsonb not null default '[]'::jsonb,
  summary text not null default '',
  section_plan jsonb not null default '[]'::jsonb,
  tone_rules jsonb not null default '[]'::jsonb,
  banned_expressions jsonb not null default '[]'::jsonb,
  model_metadata jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists idx_writing_structure_runs_article_id on writing_structure_runs (article_id);
create index if not exists idx_writing_structure_runs_workspace_created_at on writing_structure_runs (workspace_id, created_at desc);
create index if not exists idx_writing_blueprints_workspace_updated_at on writing_blueprints (workspace_id, updated_at desc);

alter table writing_structure_runs enable row level security;
alter table writing_blueprints enable row level security;
