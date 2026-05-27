alter table articles
  add column if not exists source_project text not null default '';

update articles
set source_project = coalesce(nullif(source_project, ''), nullif(source_name, ''), source_account, '引用知识库')
where source_project = '';

alter table drafts
  add column if not exists source_article_ids jsonb not null default '[]'::jsonb,
  add column if not exists content_channel text not null default 'wechat',
  add column if not exists publish_status text not null default 'draft',
  add column if not exists planned_publish_at text not null default '',
  add column if not exists published_at text not null default '',
  add column if not exists queue_order integer not null default 0,
  add column if not exists notes text not null default '';

update drafts
set publish_status = 'published'
where publish_status = 'draft' and wechat_draft_status = 'sent';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'drafts_content_channel_check'
  ) then
    alter table drafts
      add constraint drafts_content_channel_check check (content_channel in ('wechat', 'xiaohongshu'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'drafts_publish_status_check'
  ) then
    alter table drafts
      add constraint drafts_publish_status_check check (publish_status in ('draft', 'queued', 'published', 'archived'));
  end if;
end $$;

create index if not exists idx_articles_workspace_source_project
  on articles (workspace_id, source_project, updated_at desc);

create index if not exists idx_drafts_workspace_channel_queue
  on drafts (workspace_id, content_channel, publish_status, queue_order, updated_at desc);
