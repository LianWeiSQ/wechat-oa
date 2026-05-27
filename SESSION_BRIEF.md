# Session Brief

Session name:

```text
主控｜wechat-oa 集成与验收
```

You are working in:

```text
/Users/william/coding/vibe/wechat-oa
```

Branch:

```text
codex/merge-wechat-agent-workstation
```

## Mission

Act as the controller session for the `wechat-oa` project.

Responsibilities:

- maintain the session plan
- assign boundaries to focused Codex sessions
- review focused-session diffs
- merge branches in a controlled order
- run final verification
- protect secrets and local data

## Focused Worktrees

- `/Users/william/coding/vibe/wechat-oa-ops-agent`
- `/Users/william/coding/vibe/wechat-oa-style-blueprint`
- `/Users/william/coding/vibe/wechat-oa-ui-calendar`
- `/Users/william/coding/vibe/wechat-oa-wechat-ops`

See:

```text
docs/codex-sessions/README.md
```

## Controller Rules

- Do not do broad implementation work here unless it is integration-only.
- Keep this worktree clean enough to merge focused branches.
- Before merging a focused branch, inspect:
  - `git diff main...branch` or the relevant base branch
  - tests claimed by that session
  - files outside its ownership boundary
- Run final:
  - `npx tsc --noEmit`
  - relevant `npm test -- ...`
  - one real smoke test if model/API behavior changed
