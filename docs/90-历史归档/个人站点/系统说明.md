# Systems

## Selected System 1: WeChat OA Agent Workstation

### One-line Description

A local-first Agent Harness that turns research materials into structured, reviewable, and schedulable long-form AI drafts.

### Problem

Single model calls are easy. Reliable long-form AI workflows are not.

A useful workflow needs to:

- ingest and store reference materials;
- extract reusable structure;
- generate a technical brief before writing;
- draft with one model and review with another;
- persist intermediate artifacts;
- keep drafts editable;
- schedule generation tasks;
- retry failed runs;
- support local-first and cloud storage paths.

Without a harness, generation becomes a fragile prompt experiment. With a harness, model calls become a system.

### System Shape

```text
Sources
  -> Article Store
  -> Writing Structure Agent
  -> Technical Brief Agent
  -> Drafting Agent
  -> Review Agent
  -> Draft Store
  -> Scheduled Runtime
  -> WeChat Draft Delivery
```

### Key Capabilities

- Article import and local knowledge library.
- Writing structure extraction.
- Writing blueprints.
- Technical brief generation.
- Multi-model drafting.
- Review and revision agent.
- Source reuse warning.
- Draft persistence.
- Scheduled generation tasks.
- Retry and run history.
- SQLite and Supabase storage paths.
- Settings for main model and review model.
- Test coverage for parsing, settings, writing pipeline, and scheduled generation.

### Engineering Decisions

1. Separate drafting model and review model.

   Draft generation benefits from fluency and style control. Review needs stricter factual boundaries, compression, and risk detection. Treating them as different roles makes the workflow easier to reason about.

2. Persist intermediate artifacts.

   The technical brief, draft, review result, and final draft should not disappear inside a single model response. Persisted artifacts make the workflow inspectable and maintainable.

3. Keep local-first storage.

   SQLite keeps the system easy to run and test locally. Supabase support makes it possible to move toward cloud storage without rewriting the core workflow.

4. Model calls are not the product.

   The product is the controlled workflow around model calls: state, settings, scheduling, retries, and review.

### Current Artifacts

- `src/lib/writing-agent.ts`
- `src/lib/wechat-generator.ts`
- `src/lib/scheduled-generation.ts`
- `src/lib/db.ts`
- `src/lib/supabase-stores.ts`
- `src/components/workbench.tsx`
- `src/components/generate-studio.tsx`
- `src/components/settings-page.tsx`

### Validation

- Unit tests for writing agents.
- Unit tests for scheduled generation.
- Component tests for workbench and generation studio.
- Full app build through Next.js.

## Selected System 2: Multi-model Writing Harness

### One-line Description

A role-based writing pipeline that uses different models for technical brief, draft generation, and review.

### Why It Exists

Long-form AI generation fails when a single model is asked to be researcher, writer, editor, reviewer, and fact-checker at once.

This harness separates responsibilities:

```text
DeepSeek
  -> technical brief, fact boundaries, section plan

MiniMax
  -> fluent first draft, narrative flow, public-facing prose

DeepSeek
  -> review, factual risk detection, compression, revision
```

### Pipeline

```text
Topic + References
  -> TechnicalBrief
  -> OriginalDraft
  -> DraftReview
  -> RevisedDraft
  -> SourceReuseWarnings
  -> LocalDraft
```

### Outputs

- `targetReader`
- `topicJudgment`
- `coreClaim`
- `verifiedFacts`
- `sourceBoundaries`
- `sectionBrief`
- `riskFlags`
- `styleInstructions`
- `editorialScore`
- `factIssues`
- `fakeSceneIssues`
- `styleIssues`
- `revisionSummary`

### What It Demonstrates

- Role separation in model orchestration.
- Factual boundary control.
- Editorial scoring.
- Reviewable intermediate states.
- Better system behavior than one-shot prompting.

## Selected System 3: Scheduled Generation Runtime

### One-line Description

A small runtime for scheduling, running, retrying, and tracking AI draft generation tasks.

### State Machine

```text
scheduled
  -> running
    -> completed
    -> failed
      -> retry
        -> scheduled
```

### Tables

- `scheduled_article_tasks`
- `scheduled_article_runs`
- `drafts`
- `settings`

### Why It Matters

AI systems that only work when a user clicks a button are still demos. Scheduled generation introduces runtime concerns:

- when should a task run;
- what happens when generation fails;
- how many times has it run;
- where is the generated draft stored;
- how can a failed run be retried;
- how can the UI show run history.

This is a small but important step from prompt tooling toward production workflow systems.

