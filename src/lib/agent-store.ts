import type { DatabaseSync } from "node:sqlite";
import { createId, nowIso } from "@/lib/ids";
import type {
  AgentDraft,
  AgentDraftStatus,
  AgentModelMetadata,
  AgentRun,
  AgentRunStatus,
  AgentRunStep,
  AgentStrategy,
  AgentStrategyModule,
  AgentStrategyModuleRole,
  AgentStrategyStatus,
  AgentTargetChannel,
  DraftReview,
  SourceReuseWarning,
} from "@/lib/types";

type MaybePromise<T> = T | Promise<T>;

export const EDITORIAL_BOARD_AGENT_STRATEGY_ID = "agent_strategy_editorial_board";
export const ARCHITECT_AGENT_STRATEGY_ID = "agent_strategy_architect";
export const TECH_WRITER_AGENT_STRATEGY_ID = "agent_strategy_technical_writer";

export type AgentStrategyCreateInput = Pick<AgentStrategy, "name"> &
  Partial<Pick<AgentStrategy, "id" | "description" | "targetChannel" | "defaultModel" | "status" | "modules">>;

export type AgentStrategyUpdateInput = Partial<
  Pick<AgentStrategy, "name" | "description" | "targetChannel" | "defaultModel" | "status" | "modules">
>;

export type AgentDraftCreateInput = Pick<
  AgentDraft,
  "title" | "bodyHtml" | "topic" | "targetChannel" | "sourceArticleIds" | "strategyId" | "strategySnapshot"
> &
  Partial<Pick<AgentDraft, "runId" | "review" | "warnings" | "status" | "localDraftId" | "wechatMediaId" | "error">>;

export type AgentDraftUpdateInput = Partial<
  Pick<
    AgentDraft,
    "title" | "bodyHtml" | "topic" | "targetChannel" | "sourceArticleIds" | "strategyId" | "strategySnapshot" | "runId" | "review" | "warnings" | "status" | "localDraftId" | "wechatMediaId" | "error"
  >
>;

export type AgentRunCreateInput = Pick<
  AgentRun,
  "strategyId" | "strategySnapshot" | "topic" | "sourceArticleIds" | "status" | "steps" | "modelMetadata"
> &
  Partial<Pick<AgentRun, "id" | "agentDraftId" | "warnings" | "error" | "finishedAt">>;

export type AgentRunUpdateInput = Partial<Pick<AgentRun, "agentDraftId" | "status" | "steps" | "warnings" | "error" | "finishedAt">>;

export type AgentStore = {
  ensureDefaultStrategies(): MaybePromise<AgentStrategy[]>;
  listStrategies(): MaybePromise<AgentStrategy[]>;
  getStrategy(id: string): MaybePromise<AgentStrategy | null>;
  createStrategy(input: AgentStrategyCreateInput): MaybePromise<AgentStrategy>;
  updateStrategy(id: string, input: AgentStrategyUpdateInput): MaybePromise<AgentStrategy | null>;
  deleteStrategy(id: string): MaybePromise<boolean>;
  listDrafts(query?: { status?: AgentDraftStatus | "all" }): MaybePromise<AgentDraft[]>;
  getDraft(id: string): MaybePromise<AgentDraft | null>;
  createDraft(input: AgentDraftCreateInput): MaybePromise<AgentDraft>;
  updateDraft(id: string, input: AgentDraftUpdateInput): MaybePromise<AgentDraft | null>;
  createRun(input: AgentRunCreateInput): MaybePromise<AgentRun>;
  updateRun(id: string, input: AgentRunUpdateInput): MaybePromise<AgentRun | null>;
  getRun(id: string): MaybePromise<AgentRun | null>;
  listRuns(agentDraftId?: string): MaybePromise<AgentRun[]>;
};

type AgentStrategyRow = {
  id: string;
  name: string;
  description: string;
  target_channel: string;
  default_model: string;
  status: string;
  modules_json: string;
  created_at: string;
  updated_at: string;
};

type AgentDraftRow = {
  id: string;
  title: string;
  body_html: string;
  topic: string;
  target_channel: string;
  source_article_ids_json: string;
  strategy_id: string;
  strategy_snapshot_json: string;
  run_id?: string | null;
  review_json?: string | null;
  warnings_json: string;
  status: string;
  local_draft_id?: string | null;
  wechat_media_id?: string | null;
  error: string;
  created_at: string;
  updated_at: string;
};

type AgentRunRow = {
  id: string;
  agent_draft_id?: string | null;
  strategy_id: string;
  strategy_snapshot_json: string;
  topic: string;
  source_article_ids_json: string;
  status: string;
  steps_json: string;
  model_metadata_json: string;
  warnings_json: string;
  error: string;
  created_at: string;
  finished_at: string;
};

export const DEFAULT_AGENT_STRATEGIES: AgentStrategy[] = [
  {
    id: EDITORIAL_BOARD_AGENT_STRATEGY_ID,
    name: "策略一：编辑部流水线",
    description: "主编、开头、节奏、排版、配图、可收藏清单和审稿 Agent 协作，默认用于公众号深度稿。",
    targetChannel: "wechat",
    defaultModel: "",
    status: "active",
    modules: [
      createDefaultModule("editorial-chief", "主编 Agent", "editor_in_chief", 1, "给选题定调：主读者、核心矛盾、强观点、事实边界和最终验收标准。"),
      createDefaultModule("technical-brief", "技术骨架 Agent", "technical_brief", 2, "拆出工程因果链、证据边界、必须讲清的概念和不能写死的事实。"),
      createDefaultModule("opening", "开头 Agent", "opening", 3, "重写前 300 字：用真实工程观察开场，迅速给出读者为什么要继续读。"),
      createDefaultModule("pacing", "节奏 Agent", "pacing", 4, "压短段落、安排转折，让文章从场景、判断、拆解到建议自然推进。"),
      createDefaultModule("layout", "排版 Agent", "layout", 5, "规划 h2、blockquote、列表、figure 占位和留白，不要做课件式目录。"),
      createDefaultModule("image", "图片插入 Agent", "image", 6, "给出 2-4 张配图 brief 和插入位置，不能编造真实截图。"),
      createDefaultModule("checklist", "可收藏清单 Agent", "checklist", 7, "把文章收束成读者愿意保存的工程检查清单。"),
      createDefaultModule("review", "审稿 Agent", "review", 8, "逐条检查事实、洗稿、虚假场景、销售 CTA、AI 味和公众号可读性。"),
    ],
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
  },
  {
    id: ARCHITECT_AGENT_STRATEGY_ID,
    name: "架构师视角",
    description: "偏系统设计和落地判断，适合 Agent/RAG/Harness/平台化技术文章。",
    targetChannel: "wechat",
    defaultModel: "",
    status: "active",
    modules: [
      createDefaultModule("architect-brief", "架构判断 Agent", "technical_brief", 1, "把选题放到架构演进里：边界、依赖、复杂度、可维护性和落地代价。"),
      createDefaultModule("architect-writer", "架构师主笔 Agent", "writer", 2, "用架构师口吻写作：克制、有判断、讲取舍，不做泛泛科普。"),
      createDefaultModule("architect-review", "工程审稿 Agent", "review", 3, "检查是否有工程证据、是否夸大，以及读者能不能带走可复用框架。"),
    ],
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
  },
  {
    id: TECH_WRITER_AGENT_STRATEGY_ID,
    name: "默认技术写手",
    description: "稳健的技术公众号链路，适合常规模型新闻、工具更新和工程经验稿。",
    targetChannel: "wechat",
    defaultModel: "",
    status: "active",
    modules: [
      createDefaultModule("default-brief", "素材整理 Agent", "technical_brief", 1, "整理参考文章可确认的信息、读者问题和不能碰的事实风险。"),
      createDefaultModule("default-writer", "技术写手 Agent", "writer", 2, "生成可读公众号正文：短段落、强观点、少术语堆砌、无销售 CTA。"),
      createDefaultModule("default-review", "发布前审稿 Agent", "review", 3, "检查标题、开头、证据、节奏、原创性和发布状态。"),
    ],
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
  },
];

export function createAgentStore(db: DatabaseSync): AgentStore {
  return {
    ensureDefaultStrategies(): AgentStrategy[] {
      const existing = this.listStrategies() as AgentStrategy[];
      if (existing.length > 0) {
        return existing;
      }
      for (const strategy of DEFAULT_AGENT_STRATEGIES) {
        insertStrategy(db, {
          ...strategy,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      }
      return this.listStrategies() as AgentStrategy[];
    },

    listStrategies(): AgentStrategy[] {
      const rows = db
        .prepare("SELECT * FROM agent_strategies ORDER BY status ASC, updated_at DESC")
        .all() as AgentStrategyRow[];
      return rows.map(mapStrategy);
    },

    getStrategy(id: string): AgentStrategy | null {
      const row = db.prepare("SELECT * FROM agent_strategies WHERE id = ?").get(id) as AgentStrategyRow | undefined;
      return row ? mapStrategy(row) : null;
    },

    createStrategy(input: AgentStrategyCreateInput): AgentStrategy {
      const timestamp = nowIso();
      const strategy: AgentStrategy = {
        id: input.id?.trim() || createId("astrategy"),
        name: input.name.trim() || "未命名策略",
        description: input.description?.trim() ?? "",
        targetChannel: normalizeTargetChannel(input.targetChannel),
        defaultModel: input.defaultModel?.trim() ?? "",
        status: normalizeStrategyStatus(input.status),
        modules: normalizeModules(input.modules ?? []),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      insertStrategy(db, strategy);
      return strategy;
    },

    updateStrategy(id: string, input: AgentStrategyUpdateInput): AgentStrategy | null {
      const existing = this.getStrategy(id) as AgentStrategy | null;
      if (!existing) {
        return null;
      }
      const updated: AgentStrategy = {
        ...existing,
        name: input.name?.trim() || existing.name,
        description: input.description === undefined ? existing.description : input.description.trim(),
        targetChannel: input.targetChannel === undefined ? existing.targetChannel : normalizeTargetChannel(input.targetChannel),
        defaultModel: input.defaultModel === undefined ? existing.defaultModel : input.defaultModel.trim(),
        status: input.status === undefined ? existing.status : normalizeStrategyStatus(input.status),
        modules: input.modules === undefined ? existing.modules : normalizeModules(input.modules),
        updatedAt: nowIso(),
      };
      db.prepare(`
        UPDATE agent_strategies
        SET name = ?, description = ?, target_channel = ?, default_model = ?, status = ?, modules_json = ?, updated_at = ?
        WHERE id = ?
      `).run(
        updated.name,
        updated.description,
        updated.targetChannel,
        updated.defaultModel,
        updated.status,
        JSON.stringify(updated.modules),
        updated.updatedAt,
        id,
      );
      return this.getStrategy(id) as AgentStrategy | null;
    },

    deleteStrategy(id: string): boolean {
      const result = db.prepare("DELETE FROM agent_strategies WHERE id = ?").run(id);
      return result.changes > 0;
    },

    listDrafts(query = {}): AgentDraft[] {
      const rows = db
        .prepare(
          `
            SELECT * FROM agent_drafts
            ORDER BY
              CASE status
                WHEN 'generated' THEN 0
                WHEN 'editing' THEN 1
                WHEN 'approved' THEN 2
                WHEN 'pushed_local' THEN 3
                WHEN 'pushed_wechat' THEN 4
                WHEN 'failed' THEN 5
                ELSE 6
              END,
              updated_at DESC
          `,
        )
        .all() as AgentDraftRow[];
      return rows.map(mapDraft).filter((draft) => !query.status || query.status === "all" || draft.status === query.status);
    },

    getDraft(id: string): AgentDraft | null {
      const row = db.prepare("SELECT * FROM agent_drafts WHERE id = ?").get(id) as AgentDraftRow | undefined;
      return row ? mapDraft(row) : null;
    },

    createDraft(input: AgentDraftCreateInput): AgentDraft {
      const timestamp = nowIso();
      const draft: AgentDraft = {
        id: createId("adraft"),
        title: input.title.trim() || "未命名 Agent 草稿",
        bodyHtml: input.bodyHtml.trim(),
        topic: input.topic.trim(),
        targetChannel: normalizeTargetChannel(input.targetChannel),
        sourceArticleIds: normalizeIds(input.sourceArticleIds),
        strategyId: input.strategyId.trim(),
        strategySnapshot: input.strategySnapshot,
        runId: input.runId?.trim() || undefined,
        review: input.review ?? null,
        warnings: input.warnings ?? [],
        status: normalizeDraftStatus(input.status),
        localDraftId: input.localDraftId?.trim() || undefined,
        wechatMediaId: input.wechatMediaId?.trim() || undefined,
        error: input.error?.trim() ?? "",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.prepare(`
        INSERT INTO agent_drafts (
          id, title, body_html, topic, target_channel, source_article_ids_json,
          strategy_id, strategy_snapshot_json, run_id, review_json, warnings_json, status,
          local_draft_id, wechat_media_id, error, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        draft.id,
        draft.title,
        draft.bodyHtml,
        draft.topic,
        draft.targetChannel,
        JSON.stringify(draft.sourceArticleIds),
        draft.strategyId,
        JSON.stringify(draft.strategySnapshot),
        draft.runId ?? null,
        draft.review ? JSON.stringify(draft.review) : null,
        JSON.stringify(draft.warnings),
        draft.status,
        draft.localDraftId ?? null,
        draft.wechatMediaId ?? null,
        draft.error,
        draft.createdAt,
        draft.updatedAt,
      );
      return draft;
    },

    updateDraft(id: string, input: AgentDraftUpdateInput): AgentDraft | null {
      const existing = this.getDraft(id) as AgentDraft | null;
      if (!existing) {
        return null;
      }
      const updated: AgentDraft = {
        ...existing,
        title: input.title?.trim() || existing.title,
        bodyHtml: input.bodyHtml === undefined ? existing.bodyHtml : input.bodyHtml.trim(),
        topic: input.topic === undefined ? existing.topic : input.topic.trim(),
        targetChannel: input.targetChannel === undefined ? existing.targetChannel : normalizeTargetChannel(input.targetChannel),
        sourceArticleIds: input.sourceArticleIds === undefined ? existing.sourceArticleIds : normalizeIds(input.sourceArticleIds),
        strategyId: input.strategyId === undefined ? existing.strategyId : input.strategyId.trim(),
        strategySnapshot: input.strategySnapshot ?? existing.strategySnapshot,
        runId: input.runId === undefined ? existing.runId : input.runId?.trim() || undefined,
        review: input.review === undefined ? existing.review : input.review ?? null,
        warnings: input.warnings === undefined ? existing.warnings : input.warnings,
        status: input.status === undefined ? existing.status : normalizeDraftStatus(input.status),
        localDraftId: input.localDraftId === undefined ? existing.localDraftId : input.localDraftId?.trim() || undefined,
        wechatMediaId: input.wechatMediaId === undefined ? existing.wechatMediaId : input.wechatMediaId?.trim() || undefined,
        error: input.error === undefined ? existing.error : input.error.trim(),
        updatedAt: nowIso(),
      };
      db.prepare(`
        UPDATE agent_drafts
        SET title = ?, body_html = ?, topic = ?, target_channel = ?, source_article_ids_json = ?,
            strategy_id = ?, strategy_snapshot_json = ?, run_id = ?, review_json = ?, warnings_json = ?,
            status = ?, local_draft_id = ?, wechat_media_id = ?, error = ?, updated_at = ?
        WHERE id = ?
      `).run(
        updated.title,
        updated.bodyHtml,
        updated.topic,
        updated.targetChannel,
        JSON.stringify(updated.sourceArticleIds),
        updated.strategyId,
        JSON.stringify(updated.strategySnapshot),
        updated.runId ?? null,
        updated.review ? JSON.stringify(updated.review) : null,
        JSON.stringify(updated.warnings),
        updated.status,
        updated.localDraftId ?? null,
        updated.wechatMediaId ?? null,
        updated.error,
        updated.updatedAt,
        id,
      );
      return this.getDraft(id) as AgentDraft | null;
    },

    createRun(input: AgentRunCreateInput): AgentRun {
      const timestamp = nowIso();
      const run: AgentRun = {
        id: input.id?.trim() || createId("arun"),
        agentDraftId: input.agentDraftId?.trim() || undefined,
        strategyId: input.strategyId.trim(),
        strategySnapshot: input.strategySnapshot,
        topic: input.topic.trim(),
        sourceArticleIds: normalizeIds(input.sourceArticleIds),
        status: normalizeRunStatus(input.status),
        steps: input.steps ?? [],
        modelMetadata: normalizeModelMetadata(input.modelMetadata),
        warnings: input.warnings ?? [],
        error: input.error?.trim() ?? "",
        createdAt: timestamp,
        finishedAt: input.finishedAt?.trim() ?? "",
      };
      db.prepare(`
        INSERT INTO agent_runs (
          id, agent_draft_id, strategy_id, strategy_snapshot_json, topic, source_article_ids_json,
          status, steps_json, model_metadata_json, warnings_json, error, created_at, finished_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        run.id,
        run.agentDraftId ?? null,
        run.strategyId,
        JSON.stringify(run.strategySnapshot),
        run.topic,
        JSON.stringify(run.sourceArticleIds),
        run.status,
        JSON.stringify(run.steps),
        JSON.stringify(run.modelMetadata),
        JSON.stringify(run.warnings),
        run.error,
        run.createdAt,
        run.finishedAt,
      );
      return run;
    },

    updateRun(id: string, input: AgentRunUpdateInput): AgentRun | null {
      const existing = this.getRun(id) as AgentRun | null;
      if (!existing) {
        return null;
      }
      const updated: AgentRun = {
        ...existing,
        agentDraftId: input.agentDraftId === undefined ? existing.agentDraftId : input.agentDraftId?.trim() || undefined,
        status: input.status === undefined ? existing.status : normalizeRunStatus(input.status),
        steps: input.steps ?? existing.steps,
        warnings: input.warnings ?? existing.warnings,
        error: input.error === undefined ? existing.error : input.error.trim(),
        finishedAt: input.finishedAt === undefined ? existing.finishedAt : input.finishedAt.trim(),
      };
      db.prepare(`
        UPDATE agent_runs
        SET agent_draft_id = ?, status = ?, steps_json = ?, warnings_json = ?, error = ?, finished_at = ?
        WHERE id = ?
      `).run(
        updated.agentDraftId ?? null,
        updated.status,
        JSON.stringify(updated.steps),
        JSON.stringify(updated.warnings),
        updated.error,
        updated.finishedAt,
        id,
      );
      return this.getRun(id) as AgentRun | null;
    },

    getRun(id: string): AgentRun | null {
      const row = db.prepare("SELECT * FROM agent_runs WHERE id = ?").get(id) as AgentRunRow | undefined;
      return row ? mapRun(row) : null;
    },

    listRuns(agentDraftId?: string): AgentRun[] {
      const rows = agentDraftId
        ? (db
            .prepare("SELECT * FROM agent_runs WHERE agent_draft_id = ? ORDER BY created_at DESC")
            .all(agentDraftId) as AgentRunRow[])
        : (db.prepare("SELECT * FROM agent_runs ORDER BY created_at DESC").all() as AgentRunRow[]);
      return rows.map(mapRun);
    },
  };
}

function insertStrategy(db: DatabaseSync, strategy: AgentStrategy): void {
  db.prepare(`
    INSERT INTO agent_strategies (
      id, name, description, target_channel, default_model, status, modules_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    strategy.id,
    strategy.name,
    strategy.description,
    strategy.targetChannel,
    strategy.defaultModel,
    strategy.status,
    JSON.stringify(strategy.modules),
    strategy.createdAt,
    strategy.updatedAt,
  );
}

function createDefaultModule(
  id: string,
  name: string,
  role: AgentStrategyModuleRole,
  order: number,
  prompt: string,
): AgentStrategyModule {
  return {
    id,
    name,
    role,
    order,
    model: "",
    prompt,
    enabled: true,
  };
}

function mapStrategy(row: AgentStrategyRow): AgentStrategy {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    targetChannel: normalizeTargetChannel(row.target_channel),
    defaultModel: row.default_model,
    status: normalizeStrategyStatus(row.status),
    modules: normalizeModules(parseJson<AgentStrategyModule[]>(row.modules_json, [])),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDraft(row: AgentDraftRow): AgentDraft {
  return {
    id: row.id,
    title: row.title,
    bodyHtml: row.body_html,
    topic: row.topic,
    targetChannel: normalizeTargetChannel(row.target_channel),
    sourceArticleIds: normalizeIds(parseJson<string[]>(row.source_article_ids_json, [])),
    strategyId: row.strategy_id,
    strategySnapshot: normalizeStrategySnapshot(parseJson<AgentStrategy | null>(row.strategy_snapshot_json, null)),
    runId: row.run_id ?? undefined,
    review: parseJson<DraftReview | null>(row.review_json ?? "null", null),
    warnings: parseJson<SourceReuseWarning[]>(row.warnings_json, []),
    status: normalizeDraftStatus(row.status),
    localDraftId: row.local_draft_id ?? undefined,
    wechatMediaId: row.wechat_media_id ?? undefined,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRun(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    agentDraftId: row.agent_draft_id ?? undefined,
    strategyId: row.strategy_id,
    strategySnapshot: normalizeStrategySnapshot(parseJson<AgentStrategy | null>(row.strategy_snapshot_json, null)),
    topic: row.topic,
    sourceArticleIds: normalizeIds(parseJson<string[]>(row.source_article_ids_json, [])),
    status: normalizeRunStatus(row.status),
    steps: parseJson<AgentRunStep[]>(row.steps_json, []),
    modelMetadata: normalizeModelMetadata(parseJson<AgentModelMetadata>(row.model_metadata_json, { provider: "", model: "" })),
    warnings: parseJson<SourceReuseWarning[]>(row.warnings_json, []),
    error: row.error,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

export function normalizeModules(modules: AgentStrategyModule[]): AgentStrategyModule[] {
  return modules
    .map((module, index) => ({
      id: module.id?.trim() || createId("amodule"),
      name: module.name?.trim() || "未命名模块",
      role: normalizeModuleRole(module.role),
      order: normalizeOrder(module.order, index + 1),
      model: module.model?.trim() ?? "",
      prompt: module.prompt?.trim() ?? "",
      enabled: module.enabled !== false,
    }))
    .sort((left, right) => left.order - right.order)
    .map((module, index) => ({ ...module, order: index + 1 }));
}

export function normalizeTargetChannel(value: unknown): AgentTargetChannel {
  return value === "xiaohongshu" ? "xiaohongshu" : "wechat";
}

export function normalizeStrategyStatus(value: unknown): AgentStrategyStatus {
  return value === "archived" ? "archived" : "active";
}

export function normalizeDraftStatus(value: unknown): AgentDraftStatus {
  if (
    value === "editing" ||
    value === "approved" ||
    value === "pushed_local" ||
    value === "pushed_wechat" ||
    value === "failed" ||
    value === "archived"
  ) {
    return value;
  }
  return "generated";
}

function normalizeRunStatus(value: unknown): AgentRunStatus {
  if (value === "completed" || value === "failed") {
    return value;
  }
  return "running";
}

function normalizeModuleRole(value: unknown): AgentStrategyModuleRole {
  if (
    value === "editor_in_chief" ||
    value === "technical_brief" ||
    value === "opening" ||
    value === "pacing" ||
    value === "layout" ||
    value === "image" ||
    value === "checklist" ||
    value === "review" ||
    value === "writer"
  ) {
    return value;
  }
  return "custom";
}

function normalizeStrategySnapshot(value: AgentStrategy | null): AgentStrategy {
  return value ?? DEFAULT_AGENT_STRATEGIES[0];
}

function normalizeModelMetadata(value: AgentModelMetadata): AgentModelMetadata {
  return {
    provider: value.provider?.trim() ?? "",
    model: value.model?.trim() ?? "",
  };
}

function normalizeIds(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));
}

function normalizeOrder(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : fallback;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
