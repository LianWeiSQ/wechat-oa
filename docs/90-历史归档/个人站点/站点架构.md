# Architecture Draft

## Core Architecture

```mermaid
flowchart LR
  sources["Sources / References"] --> articles["Article Store"]
  articles --> structure["Writing Structure Agent"]
  structure --> blueprint["Writing Blueprint"]
  articles --> brief["Technical Brief Agent"]
  blueprint --> draft["Drafting Agent"]
  brief --> draft
  draft --> review["Review Agent"]
  review --> warnings["Source Reuse Warnings"]
  review --> draftStore["Draft Store"]
  draftStore --> schedule["Scheduled Runtime"]
  schedule --> wechat["WeChat Draft Delivery"]
```

## Multi-model Harness

```mermaid
sequenceDiagram
  participant User
  participant Harness
  participant DS as DeepSeek
  participant MM as MiniMax
  participant Store

  User->>Harness: Topic + reference articles
  Harness->>DS: Generate technical brief
  DS-->>Harness: Facts, boundaries, section plan
  Harness->>MM: Generate original draft
  MM-->>Harness: Draft HTML + editorial score
  Harness->>DS: Review and revise
  DS-->>Harness: Review result + revised draft
  Harness->>Harness: Source reuse scan
  Harness->>Store: Save final draft and artifacts
```

## Scheduled Runtime State Machine

```mermaid
stateDiagram-v2
  [*] --> scheduled
  scheduled --> running
  running --> completed
  running --> failed
  failed --> scheduled: retry
  completed --> scheduled: recurring task
  completed --> [*]: one-time task
```

## Data Model Sketch

```mermaid
erDiagram
  articles ||--o{ writing_structure_runs : has
  articles ||--o{ analysis_runs : has
  writing_blueprints }o--o{ articles : references
  drafts ||--o{ draft_image_assets : has
  scheduled_article_tasks ||--o{ scheduled_article_runs : has
  scheduled_article_tasks }o--|| drafts : creates

  articles {
    text id
    text title
    text source_type
    text source_name
    text content_text
    text category
    text tags_json
  }

  drafts {
    text id
    text title
    text body
    text export_format
    text wechat_draft_status
  }

  scheduled_article_tasks {
    text id
    text status
    text schedule_type
    text next_run_at
    text input_json
    text draft_id
  }

  scheduled_article_runs {
    text id
    text task_id
    text status
    text started_at
    text finished_at
    text draft_id
    text error
  }
```

## Architecture Narrative

The system is built around a simple belief:

> A model call is not a workflow. A workflow needs state, role separation, review, persistence, and recovery.

The harness wraps model calls in explicit stages. Each stage has a contract:

- structure extraction turns examples into reusable writing assets;
- technical brief generation defines facts and boundaries;
- drafting turns the brief into public-facing prose;
- review catches factual risk, fake scenes, style problems, and CTA leakage;
- persistence makes the output inspectable;
- scheduling turns one-off generation into a runtime task.

This creates a system where the model is important, but not the only important part. The harness decides what the model sees, what it must output, where results are stored, and how failures are handled.

## Design Principles

1. The model is a component, not the system.
2. Intermediate artifacts should be inspectable.
3. Review should be a separate role, not a paragraph at the end of the prompt.
4. State should survive the request.
5. Failed tasks should have a recovery path.
6. Local-first should remain possible.
7. Cloud storage should be an implementation detail, not a rewrite.

