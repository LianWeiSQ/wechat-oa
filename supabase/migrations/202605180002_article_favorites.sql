alter table articles
  add column if not exists is_favorite boolean not null default false;

create index if not exists idx_articles_workspace_favorite
  on articles (workspace_id, is_favorite, updated_at desc);
