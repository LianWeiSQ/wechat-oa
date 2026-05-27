# Codex Sessions Control Panel

This repo is managed with one controller session and four focused implementation sessions.

## Controller Session

Session name:

```text
主控｜wechat-oa 集成与验收
```

Directory:

```text
/Users/william/coding/vibe/wechat-oa
```

Branch:

```text
codex/merge-wechat-agent-workstation
```

Role:

- Owns architecture, task slicing, merge order, test policy, and final acceptance.
- Reviews diffs from focused sessions.
- Runs `npx tsc --noEmit`, focused tests, and final smoke tests.
- Does not do broad feature work unless integration requires it.

## Focused Sessions

| Session | Directory | Branch | Purpose |
| --- | --- | --- | --- |
| 运营｜公众号定位与选题日历 | `/Users/william/coding/vibe/wechat-oa-ops-agent` | `codex/ops-agent` | Operation profile, content pillars, editorial calendar, operation brief |
| 风格｜StyleBlueprint 样本拆解 | `/Users/william/coding/vibe/wechat-oa-style-blueprint` | `codex/style-blueprint` | Style blueprint agent, sample account structure extraction, own voice fusion |
| 前端｜运营日历与配置 UI | `/Users/william/coding/vibe/wechat-oa-ui-calendar` | `codex/ui-calendar` | Workbench/settings UI for operation profile, calendar, style blueprint selection |
| 微信｜后台运营与复盘数据 | `/Users/william/coding/vibe/wechat-oa-wechat-ops` | `codex/wechat-ops` | WeChat backend operations, publish metrics, manual analytics, later menu/keyword APIs |

Each focused session has a root `SESSION_BRIEF.md`. Start new Codex sessions from the corresponding directory and paste that file as the first instruction.

## Merge Order

Use this order unless there is a clear dependency reason to change it:

1. `codex/ops-agent`
2. `codex/style-blueprint`
3. `codex/ui-calendar`
4. `codex/wechat-ops`

Reasoning:

- Operation profile and style blueprint define the data and prompt contracts.
- UI should bind to those contracts after they settle.
- WeChat backend and analytics should consume the stable content pipeline.

## Rules

- One session owns one layer. Avoid cross-layer edits.
- No session should commit secrets, SQLite DB files, or generated runtime artifacts.
- Keep commits small and independently testable.
- Before handoff, each session must run its focused tests and report exact commands.
- Controller resolves integration conflicts; focused sessions should not merge each other.

## Standard Handoff Format

```text
完成内容：
- ...

改动文件：
- ...

验证：
- npm test -- ...
- npx tsc --noEmit

风险 / 未完成：
- ...

下一步建议：
- ...
```
