create table if not exists agent_strategies (
  id text primary key,
  workspace_id text not null default 'default' references workspaces(id) on delete cascade,
  name text not null,
  description text not null default '',
  target_channel text not null default 'wechat' check (target_channel in ('wechat', 'xiaohongshu')),
  default_model text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  modules jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists agent_drafts (
  id text primary key,
  workspace_id text not null default 'default' references workspaces(id) on delete cascade,
  title text not null,
  body_html text not null,
  topic text not null default '',
  target_channel text not null default 'wechat' check (target_channel in ('wechat', 'xiaohongshu')),
  source_article_ids jsonb not null default '[]'::jsonb,
  strategy_id text not null default '',
  strategy_snapshot jsonb not null,
  run_id text,
  review jsonb,
  warnings jsonb not null default '[]'::jsonb,
  status text not null default 'generated' check (status in ('generated', 'editing', 'approved', 'pushed_local', 'pushed_wechat', 'failed', 'archived')),
  local_draft_id text references drafts(id) on delete set null,
  wechat_media_id text,
  error text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists agent_runs (
  id text primary key,
  workspace_id text not null default 'default' references workspaces(id) on delete cascade,
  agent_draft_id text references agent_drafts(id) on delete set null,
  strategy_id text not null default '',
  strategy_snapshot jsonb not null,
  topic text not null default '',
  source_article_ids jsonb not null default '[]'::jsonb,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  steps jsonb not null default '[]'::jsonb,
  model_metadata jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  error text not null default '',
  created_at timestamptz not null,
  finished_at text not null default ''
);

create index if not exists idx_agent_strategies_workspace_updated_at
  on agent_strategies (workspace_id, updated_at desc);

create index if not exists idx_agent_drafts_workspace_status_updated_at
  on agent_drafts (workspace_id, status, updated_at desc);

create index if not exists idx_agent_runs_workspace_draft_created_at
  on agent_runs (workspace_id, agent_draft_id, created_at desc);

alter table agent_strategies enable row level security;
alter table agent_drafts enable row level security;
alter table agent_runs enable row level security;
