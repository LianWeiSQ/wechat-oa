# Supabase Postgres + Storage 后端重构

Date: 2026-05-15

## Summary

后端存储方向切到 Supabase：Postgres 保存文章、分析、草稿、设置和图片资产元数据；Supabase Storage 保存图片二进制。没有 Supabase 环境变量时，应用保留 SQLite fallback，保证本地开发和测试不中断。

## Runtime Config

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET=wechat-oa-assets`
- `WECHAT_OA_WORKSPACE_ID=default`

配置 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 后，`stores()` 会使用 Supabase repository；否则使用原 SQLite store。

## Data Model

- `workspaces`：团队化预留，本轮默认 `default`。
- `articles`、`analysis_runs`、`topic_candidates`、`drafts`、`article_parse_runs`、`content_agent_runs`、`settings`：迁移到 Postgres。
- `assets`：统一图片资产元数据，包含 object key、public path、hash、mime、来源、状态、prompt、alt/caption。
- `asset_links`：把资产关联到文章、草稿或分析。
- `draft_image_assets`：保留现有公众号草稿图片视图，兼容前端和旧 API。

## Migration

1. 在 Supabase 项目执行 `supabase/migrations/202605150001_initial_cloud_storage.sql`。
2. 创建私有 bucket：`wechat-oa-assets`。
3. 设置环境变量。
4. 运行 `pnpm db:migrate:supabase`，默认读取 `data/wechat-oa.sqlite`。

迁移脚本会上传 `draft_image_assets.local_path` 指向的本地生成图，并把对应记录写入 `assets`、`asset_links` 和兼容表。

## Notes

- 图片原文件不写入 Postgres BLOB。
- Storage bucket 默认私有，读取图片通过 Next.js API 代理。
- 当前还未接 Supabase Auth；RLS 已启用但运行时使用 server service role。后续接 Auth 时再增加用户策略。
