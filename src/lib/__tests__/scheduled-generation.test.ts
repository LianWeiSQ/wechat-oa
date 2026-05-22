import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db";
import { createDraftStore } from "@/lib/drafts";
import {
  createScheduledArticleStore,
  runDueScheduledArticleTasks,
  runScheduledArticleTask,
} from "@/lib/scheduled-generation";
import type { AiSettings } from "@/lib/types";
import type { WeChatGenerateInput } from "@/lib/wechat-generator";

let tempDir: string;

const settings: AiSettings = {
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-test",
  model: "gpt-5.4",
};

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "wechat-oa-schedule-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("scheduled article generation", () => {
  it("creates a due task, generates a local draft, and writes execution logs", async () => {
    const db = openDatabase(join(tempDir, "test.sqlite"));
    const scheduleStore = createScheduledArticleStore(db);
    const draftStore = createDraftStore(db);
    const task = scheduleStore.createTask({
      name: "每日 AI 观察",
      scheduleType: "once",
      scheduledAt: "2026-05-21T08:00:00.000Z",
      input: generateInput(),
    });

    const results = await runDueScheduledArticleTasks({
      scheduleStore,
      draftStore,
      settingsStore: { getAiSettings: () => settings },
      now: "2026-05-21T08:01:00.000Z",
      modelClient: async () =>
        JSON.stringify({
          title: "AI Agent 落地复盘",
          deck: "先补齐工程闭环。",
          summary: "生成摘要",
          coverLine: "工程闭环比模型名更重要",
          bodyHtml: "<h1>AI Agent 落地复盘</h1><p>正文</p>",
          hashtags: ["#AIAgent"],
        }),
    });

    expect(results).toHaveLength(1);
    expect(results[0].draft?.title).toBe("AI Agent 落地复盘");
    const savedTask = scheduleStore.getTask(task.id);
    expect(savedTask?.status).toBe("completed");
    expect(savedTask?.draftId).toBe(results[0].draft?.id);
    expect(savedTask?.runCount).toBe(1);
    const runs = scheduleStore.listRuns(task.id);
    expect(runs[0].status).toBe("completed");
    expect(runs[0].message).toContain("AI Agent 落地复盘");
    expect(draftStore.getDraft(results[0].draft?.id ?? "")?.body).toContain("<p>正文</p>");
    db.close();
  });

  it("records failures and lets users retry the task", async () => {
    const db = openDatabase(join(tempDir, "test.sqlite"));
    const scheduleStore = createScheduledArticleStore(db);
    const draftStore = createDraftStore(db);
    const task = scheduleStore.createTask({
      scheduleType: "once",
      scheduledAt: "2026-05-21T08:00:00.000Z",
      input: generateInput(),
    });

    await runScheduledArticleTask({
      taskId: task.id,
      scheduleStore,
      draftStore,
      settingsStore: { getAiSettings: () => settings },
      modelClient: async () => {
        throw new Error("模型暂时不可用");
      },
    });

    expect(scheduleStore.getTask(task.id)?.status).toBe("failed");
    expect(scheduleStore.getTask(task.id)?.error).toBe("模型暂时不可用");
    expect(scheduleStore.listRuns(task.id)[0].status).toBe("failed");

    const retried = scheduleStore.rescheduleForRetry(task.id, "2026-05-21T08:10:00.000Z");

    expect(retried?.status).toBe("scheduled");
    expect(retried?.error).toBe("");
    expect(retried?.nextRunAt).toBe("2026-05-21T08:10:00.000Z");
    db.close();
  });
});

function generateInput(): WeChatGenerateInput {
  return {
    title: "AI Agent 落地复盘",
    mode: "new-title",
    articleType: "share",
    length: "xlong",
    brief: "围绕企业 Agent 项目落地复盘。",
    audience: "AI 从业者",
    persona: "专业、克制",
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
