create table if not exists scheduled_article_tasks (
  id text primary key,
  workspace_id text not null default 'default' references workspaces(id) on delete cascade,
  name text not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'running', 'completed', 'failed', 'paused')),
  schedule_type text not null default 'once' check (schedule_type in ('once', 'daily', 'weekly')),
  scheduled_at timestamptz not null,
  next_run_at timestamptz,
  last_run_at timestamptz,
  input jsonb not null,
  draft_id text references drafts(id) on delete set null,
  error text not null default '',
  run_count integer not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists scheduled_article_runs (
  id text primary key,
  workspace_id text not null default 'default' references workspaces(id) on delete cascade,
  task_id text not null references scheduled_article_tasks(id) on delete cascade,
  status text not null check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null,
  finished_at timestamptz,
  draft_id text references drafts(id) on delete set null,
  message text not null default '',
  error text not null default ''
);

create index if not exists idx_scheduled_article_tasks_workspace_due
  on scheduled_article_tasks (workspace_id, status, next_run_at);

create index if not exists idx_scheduled_article_runs_task_started
  on scheduled_article_runs (task_id, started_at desc);

alter table scheduled_article_tasks enable row level security;
alter table scheduled_article_runs enable row level security;
