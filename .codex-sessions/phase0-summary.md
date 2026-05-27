# Phase 0 Summary

Date: 2026-05-22

Controller session:

```text
主控｜wechat-oa 集成与验收
```

## Completed

Four focused worktrees were created and each worker completed a Phase 0 plan.

| Session | Phase 0 output |
| --- | --- |
| 运营｜公众号定位与选题日历 | `/Users/william/coding/vibe/wechat-oa-ops-agent/docs/codex-sessions/ops-agent-phase0.md` |
| 风格｜StyleBlueprint 样本拆解 | `/Users/william/coding/vibe/wechat-oa-style-blueprint/docs/codex-sessions/style-blueprint-phase0.md` |
| 前端｜运营日历与配置 UI | `/Users/william/coding/vibe/wechat-oa-ui-calendar/docs/codex-sessions/ui-calendar-phase0.md` |
| 微信｜后台运营与复盘数据 | `/Users/william/coding/vibe/wechat-oa-wechat-ops/docs/codex-sessions/wechat-ops-phase0.md` |

## Controller Decisions

### 1. Operation Layer Storage

Use four independent operation tables, not a single settings JSON blob.

Reason:

- operation profile, pillars, calendar items, and operation briefs have different lifecycles
- calendar status filtering will matter in the UI
- later performance metrics need stable foreign keys
- Supabase sync is cleaner with normalized rows and `workspace_id`

Planned models:

- `WechatOperationProfile`
- `ContentPillar`
- `EditorialCalendarItem`
- `OperationBrief`

### 2. Style Blueprint Separation

Keep `StyleBlueprint` separate from `WritingBlueprint`.

Reason:

- `WritingBlueprint` constrains article structure
- `StyleBlueprint` constrains language rhythm and editorial moves
- separating them reduces copy-risk and makes UI selection clearer

### 3. UI Timing

UI session should not implement against imaginary final APIs. It should wait for operation/style contracts, or use optional props and strict test mocks.

### 4. WeChat Ops Scope

Start with manual metrics and deterministic scoring.

Do not implement menu automation or keyword replies until the account type, certification status, server URL, and API permissions are confirmed.

## Phase 1 Order

1. `codex/ops-agent`: implement operation models, store, parser, and APIs.
2. `codex/style-blueprint`: implement style blueprint types, prompts, parsers, and tests.
3. `codex/ui-calendar`: implement UI after the backend contracts exist.
4. `codex/wechat-ops`: implement manual metric models/store/API after operation IDs are stable.

## Merge Policy

Merge order should follow Phase 1 order. Controller runs:

```bash
npx tsc --noEmit
npm test -- src/lib/__tests__/writing-agent.test.ts src/lib/__tests__/settings.test.ts src/components/__tests__/workbench.test.tsx
```

Add focused tests per branch before merging.
