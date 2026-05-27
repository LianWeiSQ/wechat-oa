# 内容导出中心

这个目录放账号系统生产出来的内容文件，统一以 `.md` 为主要格式维护。

## 主要入口

- [本地创作文章](./本地创作文章/README.md)
  从本地系统数据库 `drafts` 表导出的公众号/小红书创作稿。这里是后续优先维护的统一入口。

- [公众号历史导出](./wechat-drafts/README.md)
  早期公众号草稿导出，包含 Harness、Agent 工程化等长文。

- [公众号系列文章](./wechat-official-account-series/README.md)
  按系列整理的公众号文章。

- [小红书笔记](./xiaohongshu-notes/README.md)
  从公众号长文拆出来的小红书短内容。

- [专题项目稿件](./wechat-article-campaigns/2026-05-20-qbitai-aigc-summit/README.md)
  围绕特定素材或活动生成的专题稿件、评估和 Agent 过程记录。

- [资料包](./lead-magnets/README.md)
  用于引流、领取或配套发布的清单和资料。

## 命名约定

- 本地生成、准备发布的文章：放到 `exports/本地创作文章/平台/中文标题.md`。
- 历史导出不强制移动，避免打乱已有引用。
- 新增文章优先使用中文文件名，必要时保留 `Agent`、`AI`、`Harness` 等英文技术词。

## 和引用素材的区别

- `exports/` 里放我们自己生产、准备发布或已经发布的内容。
- 复制链接导入的外部文章属于引用素材，主要存在数据库 `articles` 表里，不放在这里当成原创稿。
