import type { DatabaseSync } from "node:sqlite";
import type { ModelClient } from "@/lib/analysis";
import { createId, nowIso } from "@/lib/ids";
import { generateWeChatArticle, type WeChatGenerateInput } from "@/lib/wechat-generator";
import type { AiSettings, LocalDraft } from "@/lib/types";

export type ScheduledArticleTaskStatus = "scheduled" | "running" | "completed" | "failed" | "paused";
export type ScheduledArticleScheduleType = "once" | "daily" | "weekly";
export type ScheduledArticleRunStatus = "running" | "completed" | "failed";

export type ScheduledArticleTask = {
  id: string;
  name: string;
  status: ScheduledArticleTaskStatus;
  scheduleType: ScheduledArticleScheduleType;
  scheduledAt: string;
  nextRunAt: string;
  lastRunAt: string;
  input: WeChatGenerateInput;
  draftId?: string;
  error: string;
  runCount: number;
  createdAt: string;
  updatedAt: string;
  runs?: ScheduledArticleRun[];
};

export type ScheduledArticleRun = {
  id: string;
  taskId: string;
  status: ScheduledArticleRunStatus;
  startedAt: string;
  finishedAt: string;
  draftId?: string;
  message: string;
  error: string;
};

export type CreateScheduledArticleTaskInput = {
  name?: string;
  scheduleType: ScheduledArticleScheduleType;
  scheduledAt: string;
  input: WeChatGenerateInput;
};

export type ScheduledArticleStore = ReturnType<typeof createScheduledArticleStore>;

export type ScheduledArticleStoreShape = {
  createTask(input: CreateScheduledArticleTaskInput): ScheduledArticleTask | Promise<ScheduledArticleTask>;
  getTask(id: string): ScheduledArticleTask | null | Promise<ScheduledArticleTask | null>;
  listTasks(): ScheduledArticleTask[] | Promise<ScheduledArticleTask[]>;
  listTasksWithRuns(runLimit?: number): ScheduledArticleTask[] | Promise<ScheduledArticleTask[]>;
  listDueTasks(now?: string, limit?: number): ScheduledArticleTask[] | Promise<ScheduledArticleTask[]>;
  listRuns(taskId: string, limit?: number): ScheduledArticleRun[] | Promise<ScheduledArticleRun[]>;
  createRun(taskId: string): ScheduledArticleRun | Promise<ScheduledArticleRun>;
  markTaskRunning(taskId: string): ScheduledArticleTask | null | Promise<ScheduledArticleTask | null>;
  completeRun(input: {
    task: ScheduledArticleTask;
    runId: string;
    draftId: string;
    message?: string;
    now?: string;
  }): ScheduledArticleTask | null | Promise<ScheduledArticleTask | null>;
  failRun(input: {
    task: ScheduledArticleTask;
    runId: string;
    error: string;
    now?: string;
  }): ScheduledArticleTask | null | Promise<ScheduledArticleTask | null>;
  rescheduleForRetry(taskId: string, nextRunAt?: string): ScheduledArticleTask | null | Promise<ScheduledArticleTask | null>;
};

type ScheduledArticleTaskRow = {
  id: string;
  name: string;
  status: ScheduledArticleTaskStatus;
  schedule_type: ScheduledArticleScheduleType;
  scheduled_at: string;
  next_run_at: string;
  last_run_at: string;
  input_json: string;
  draft_id?: string;
  error: string;
  run_count: number;
  created_at: string;
  updated_at: string;
};

type ScheduledArticleRunRow = {
  id: string;
  task_id: string;
  status: ScheduledArticleRunStatus;
  started_at: string;
  finished_at: string;
  draft_id?: string;
  message: string;
  error: string;
};

type DraftStore = {
  createDraft(input: Pick<LocalDraft, "title" | "body" | "sourceAnalysisIds" | "exportFormat">): LocalDraft | Promise<LocalDraft>;
};

type SettingsStore = {
  getAiSettings(): AiSettings | Promise<AiSettings>;
};

export function createScheduledArticleStore(db: DatabaseSync) {
  return {
    createTask(input: CreateScheduledArticleTaskInput): ScheduledArticleTask {
      const timestamp = nowIso();
      const nextRunAt = normalizeIsoDate(input.scheduledAt, "定时生成时间无效");
      const task: ScheduledArticleTask = {
        id: createId("schedule"),
        name: normalizeTaskName(input.name, input.input.title),
        status: "scheduled",
        scheduleType: input.scheduleType,
        scheduledAt: nextRunAt,
        nextRunAt,
        lastRunAt: "",
        input: input.input,
        error: "",
        runCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      db.prepare(`
        INSERT INTO scheduled_article_tasks (
          id, name, status, schedule_type, scheduled_at, next_run_at, last_run_at,
          input_json, draft_id, error, run_count, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        task.id,
        task.name,
        task.status,
        task.scheduleType,
        task.scheduledAt,
        task.nextRunAt,
        task.lastRunAt,
        JSON.stringify(task.input),
        task.draftId ?? null,
        task.error,
        task.runCount,
        task.createdAt,
        task.updatedAt,
      );

      return task;
    },

    getTask(id: string): ScheduledArticleTask | null {
      const row = db.prepare("SELECT * FROM scheduled_article_tasks WHERE id = ?").get(id) as ScheduledArticleTaskRow | undefined;
      return row ? mapTask(row) : null;
    },

    listTasks(): ScheduledArticleTask[] {
      const rows = db
        .prepare("SELECT * FROM scheduled_article_tasks ORDER BY created_at DESC")
        .all() as ScheduledArticleTaskRow[];
      return rows.map(mapTask);
    },

    listTasksWithRuns(runLimit = 5): ScheduledArticleTask[] {
      return this.listTasks().map((task) => ({
        ...task,
        runs: this.listRuns(task.id, runLimit),
      }));
    },

    listDueTasks(now = nowIso(), limit = 10): ScheduledArticleTask[] {
      const rows = db
        .prepare(`
          SELECT * FROM scheduled_article_tasks
          WHERE status = 'scheduled' AND next_run_at <> '' AND next_run_at <= ?
          ORDER BY next_run_at ASC
          LIMIT ?
        `)
        .all(now, limit) as ScheduledArticleTaskRow[];
      return rows.map(mapTask);
    },

    listRuns(taskId: string, limit = 10): ScheduledArticleRun[] {
      const rows = db
        .prepare("SELECT * FROM scheduled_article_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT ?")
        .all(taskId, limit) as ScheduledArticleRunRow[];
      return rows.map(mapRun);
    },

    createRun(taskId: string): ScheduledArticleRun {
      const timestamp = nowIso();
      const run: ScheduledArticleRun = {
        id: createId("run"),
        taskId,
        status: "running",
        startedAt: timestamp,
        finishedAt: "",
        message: "任务开始执行",
        error: "",
      };
      db.prepare(`
        INSERT INTO scheduled_article_runs (
          id, task_id, status, started_at, finished_at, draft_id, message, error
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(run.id, run.taskId, run.status, run.startedAt, run.finishedAt, run.draftId ?? null, run.message, run.error);
      return run;
    },

    markTaskRunning(taskId: string): ScheduledArticleTask | null {
      db.prepare(`
        UPDATE scheduled_article_tasks
        SET status = 'running', error = '', updated_at = ?
        WHERE id = ?
      `).run(nowIso(), taskId);
      return this.getTask(taskId);
    },

    completeRun(input: {
      task: ScheduledArticleTask;
      runId: string;
      draftId: string;
      message?: string;
      now?: string;
    }): ScheduledArticleTask | null {
      const timestamp = input.now ?? nowIso();
      const nextRunAt = nextScheduledRun(input.task, timestamp);
      const nextStatus: ScheduledArticleTaskStatus = nextRunAt ? "scheduled" : "completed";
      db.prepare(`
        UPDATE scheduled_article_runs
        SET status = 'completed', finished_at = ?, draft_id = ?, message = ?, error = ''
        WHERE id = ?
      `).run(timestamp, input.draftId, input.message ?? "已生成本地草稿", input.runId);
      db.prepare(`
        UPDATE scheduled_article_tasks
        SET status = ?, next_run_at = ?, last_run_at = ?, draft_id = ?, error = '',
            run_count = run_count + 1, updated_at = ?
        WHERE id = ?
      `).run(nextStatus, nextRunAt, timestamp, input.draftId, timestamp, input.task.id);
      return this.getTask(input.task.id);
    },

    failRun(input: { task: ScheduledArticleTask; runId: string; error: string; now?: string }): ScheduledArticleTask | null {
      const timestamp = input.now ?? nowIso();
      db.prepare(`
        UPDATE scheduled_article_runs
        SET status = 'failed', finished_at = ?, message = '执行失败', error = ?
        WHERE id = ?
      `).run(timestamp, input.error, input.runId);
      db.prepare(`
        UPDATE scheduled_article_tasks
        SET status = 'failed', last_run_at = ?, error = ?, run_count = run_count + 1, updated_at = ?
        WHERE id = ?
      `).run(timestamp, input.error, timestamp, input.task.id);
      return this.getTask(input.task.id);
    },

    rescheduleForRetry(taskId: string, nextRunAt = nowIso()): ScheduledArticleTask | null {
      db.prepare(`
        UPDATE scheduled_article_tasks
        SET status = 'scheduled', next_run_at = ?, error = '', updated_at = ?
        WHERE id = ?
      `).run(normalizeIsoDate(nextRunAt, "重试时间无效"), nowIso(), taskId);
      return this.getTask(taskId);
    },
  };
}

export async function runScheduledArticleTask(input: {
  taskId: string;
  scheduleStore: ScheduledArticleStoreShape;
  draftStore: DraftStore;
  settingsStore: SettingsStore;
  modelClient?: ModelClient;
}): Promise<{ task: ScheduledArticleTask | null; run: ScheduledArticleRun | null; draft: LocalDraft | null }> {
  const task = await input.scheduleStore.getTask(input.taskId);
  if (!task) {
    return { task: null, run: null, draft: null };
  }
  if (task.status === "running") {
    throw new Error("任务正在执行中");
  }

  await input.scheduleStore.markTaskRunning(task.id);
  const run = await input.scheduleStore.createRun(task.id);
  try {
    const article = await generateWeChatArticle(task.input, await input.settingsStore.getAiSettings(), input.modelClient);
    const draft = await input.draftStore.createDraft({
      title: article.title,
      body: article.bodyHtml,
      sourceAnalysisIds: [],
      exportFormat: "html",
    });
    const savedTask = await input.scheduleStore.completeRun({
      task,
      runId: run.id,
      draftId: draft.id,
      message: `已生成草稿：${draft.title}`,
    });
    return { task: savedTask, run: { ...run, status: "completed", draftId: draft.id }, draft };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const savedTask = await input.scheduleStore.failRun({ task, runId: run.id, error: message });
    return { task: savedTask, run: { ...run, status: "failed", error: message }, draft: null };
  }
}

export async function runDueScheduledArticleTasks(input: {
  scheduleStore: ScheduledArticleStoreShape;
  draftStore: DraftStore;
  settingsStore: SettingsStore;
  now?: string;
  limit?: number;
  modelClient?: ModelClient;
}): Promise<Array<{ task: ScheduledArticleTask | null; run: ScheduledArticleRun | null; draft: LocalDraft | null }>> {
  const dueTasks = await input.scheduleStore.listDueTasks(input.now ?? nowIso(), input.limit ?? 5);
  const results = [];
  for (const task of dueTasks) {
    results.push(
      await runScheduledArticleTask({
        taskId: task.id,
        scheduleStore: input.scheduleStore,
        draftStore: input.draftStore,
        settingsStore: input.settingsStore,
        modelClient: input.modelClient,
      }),
    );
  }
  return results;
}

function nextScheduledRun(task: ScheduledArticleTask, fromIso: string): string {
  if (task.scheduleType === "once") {
    return "";
  }

  const stepDays = task.scheduleType === "weekly" ? 7 : 1;
  const next = new Date(task.nextRunAt || task.scheduledAt);
  const from = new Date(fromIso);
  if (Number.isNaN(next.getTime()) || Number.isNaN(from.getTime())) {
    return "";
  }
  while (next <= from) {
    next.setUTCDate(next.getUTCDate() + stepDays);
  }
  return next.toISOString();
}

function normalizeTaskName(value: string | undefined, fallbackTitle: string): string {
  const trimmed = value?.trim();
  return trimmed || `${fallbackTitle.trim() || "公众号文章"} 定时生成`;
}

function normalizeIsoDate(value: string, errorMessage: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(errorMessage);
  }
  return date.toISOString();
}

function mapTask(row: ScheduledArticleTaskRow): ScheduledArticleTask {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    scheduleType: row.schedule_type,
    scheduledAt: row.scheduled_at,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    input: parseJson<WeChatGenerateInput>(row.input_json, fallbackGenerateInput()),
    draftId: row.draft_id || undefined,
    error: row.error,
    runCount: row.run_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRun(row: ScheduledArticleRunRow): ScheduledArticleRun {
  return {
    id: row.id,
    taskId: row.task_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    draftId: row.draft_id || undefined,
    message: row.message,
    error: row.error,
  };
}

function fallbackGenerateInput(): WeChatGenerateInput {
  return {
    title: "未命名公众号文章",
    mode: "new-title",
    articleType: "share",
    length: "xlong",
    brief: "",
    audience: "",
    persona: "",
    referenceNotes: "",
    options: {
      quoteTitle: false,
      addEmoji: true,
      addHashtags: true,
      filterSensitiveWords: true,
      filterMarketingWords: true,
    },
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
