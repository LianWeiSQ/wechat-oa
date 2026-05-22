# 技术文章库 + 微信公众号工作台拆分

Date: 2026-05-15

## Summary

`wechat-oa` 现在拆成两个工作区：

- `技术文章库`：保存任意技术文章，支持手动粘贴和 URL 解析，负责智能处理、文章质量判断和多视角分析。
- `微信公众号`：引用文章库内容生成公众号长文、配图、导出和微信草稿投递，不再承担文章导入职责。

## Implemented Boundaries

- 文章库 owns：`/api/library/import/*`、`/api/library/articles/*`、Article、ArticleParseRun、ContentAgentRun。
- 微信公众号 owns：`/api/wechat/articles/:id/professional-draft`、草稿、配图资产、微信配置和投递。
- 共享：AI settings、Image settings、AnalysisRun、TopicCandidate。

## Data Model Notes

`Article` 已泛化为通用技术文章：

- 新字段：`sourceType`, `sourceName`, `contentHtml`, `contentText`
- 兼容字段：`sourceAccount`, `content`
- 兼容迁移：已有 `source_account/content` 数据会映射到新字段，不删除旧列。

新增记录：

- `ArticleParseRun`：保存 URL 解析策略、质量分、元数据和 fallback 原因。
- `ContentAgentRun`：保存 Agent 状态、步骤、文章类型、质量分、推荐模板和建议动作。

## Agent Behavior

内容处理 Agent 使用当前本地 OpenAI-compatible 模型配置，默认仍是：

- `baseUrl`: `http://127.0.0.1:8787/v1`
- `model`: `gpt-5.2`

Agent 输出：

- 文章类型
- 质量评分
- 推荐分析模板
- 建议动作
- 可追溯步骤日志

缺少模型配置时，Agent 保存 failed run，并给出可操作错误，不破坏文章数据。

## Verification

- `pnpm test` passed after implementation: 11 files, 28 tests.
- `pnpm lint` passed.
- `pnpm build` passed.
- Browser smoke passed at `http://127.0.0.1:3002`:
  - 默认进入 `技术文章库`，可见 `导入技术文章` 和 `智能处理 Agent`。
  - 切换到 `微信公众号` 后，可见 `生成专业长文 + 配图`、`图片模型配置`、`微信后台`。
  - `微信公众号` 页面不再显示文章导入表单。

## Bugfix Notes

- 2026-05-15：修复导入文章成功后前端报错的问题。
  - 现象：URL 导入完成后浏览器抛出 `Cannot read properties of null (reading 'reset')`。
  - 根因：React form event 在 `await fetch` 之后 `currentTarget` 失效。
  - 修复：submit handler 入口先保存 `formElement`，后续使用真实 DOM form 执行 `reset()`。
  - 覆盖：新增 Workbench URL 导入回归测试。
