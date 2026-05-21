import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerateStudio } from "@/components/generate-studio";
import type { ScheduledArticleTask } from "@/lib/scheduled-generation";

describe("GenerateStudio", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a workstation with immediate and scheduled generation", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(runDueResponse()));

    render(<GenerateStudio aiModel="gpt-5.4" aiReady wechatReady={false} />);

    expect(screen.getByRole("heading", { name: "公众号生成工作站" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 生成新标题" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "立即生成正文" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "创建定时任务" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "扫描到期任务" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "工作台" })).toHaveAttribute("href", "/");
  });

  it("submits form data to the generate API and renders the generated article", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/schedules/run-due") {
        return runDueResponse();
      }
      return {
        ok: true,
        json: async () => ({
          article: {
            title: "为什么 AI Agent 项目总是卡在落地阶段",
            deck: "不是模型不够强，而是工程闭环没补齐。",
            summary: "很多团队不是没有模型能力，而是没有真正的任务拆解、权限、状态和评估闭环。",
            coverLine: "问题不在模型，而在系统工程",
            bodyHtml: "<h1>为什么 AI Agent 项目总是卡在落地阶段</h1><p>正文预览</p>",
            plainText: "正文预览",
            hashtags: ["#AIAgent", "#公众号创作"],
          },
          draft: {
            id: "draft_1",
            title: "为什么 AI Agent 项目总是卡在落地阶段",
            body: "<h1>为什么 AI Agent 项目总是卡在落地阶段</h1><p>正文预览</p>",
            sourceAnalysisIds: [],
            exportFormat: "html",
            wechatDraftStatus: "not_sent",
            createdAt: "now",
            updatedAt: "now",
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GenerateStudio aiModel="gpt-5.4" aiReady wechatReady />);

    await userEvent.type(screen.getByLabelText("标题"), "为什么 AI Agent 项目总是卡在落地阶段");
    await userEvent.type(screen.getByLabelText("内容方向"), "围绕企业做 Agent 项目的常见卡点，写成公众号长文。");
    await userEvent.click(screen.getByRole("button", { name: "立即生成正文" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/generate",
      expect.objectContaining({
        method: "POST",
      }),
    );

    expect(await screen.findAllByRole("heading", { name: "为什么 AI Agent 项目总是卡在落地阶段" })).toHaveLength(2);
    expect(screen.getAllByText("问题不在模型，而在系统工程")).toHaveLength(2);
    expect(screen.getByText("#AIAgent")).toBeInTheDocument();
    expect(within(screen.getByRole("article")).getByText("正文预览")).toBeInTheDocument();
  });

  it("creates a scheduled generation task and shows it in the queue", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/schedules/run-due") {
        return { ok: true, json: async () => ({ results: [], tasks: [] }) };
      }
      return {
        ok: true,
        json: async () => ({
          task: scheduledTask({
            id: "schedule_1",
            name: "每周一 AI Agent 深度文",
            status: "scheduled",
          }),
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GenerateStudio aiModel="gpt-5.4" aiReady wechatReady />);

    await userEvent.type(screen.getByLabelText("标题"), "AI Agent 落地复盘");
    await userEvent.type(screen.getByLabelText("生成时间"), "2026-05-22T09:30");
    await userEvent.type(screen.getByLabelText("任务名称"), "每周一 AI Agent 深度文");
    await userEvent.click(screen.getByRole("button", { name: "创建定时任务" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/schedules",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("每周一 AI Agent 深度文"),
      }),
    );
    expect(await screen.findByText("每周一 AI Agent 深度文")).toBeInTheDocument();
    expect(screen.getByText("待执行")).toBeInTheDocument();
  });

  it("renders failed task logs and lets users retry", async () => {
    const failedTask = scheduledTask({
      id: "schedule_failed",
      status: "failed",
      error: "模型 API Key 未配置",
      runs: [
        {
          id: "run_failed",
          taskId: "schedule_failed",
          status: "failed",
          startedAt: "2026-05-21T08:00:00.000Z",
          finishedAt: "2026-05-21T08:00:02.000Z",
          message: "执行失败",
          error: "模型 API Key 未配置",
        },
      ],
    });
    const retriedTask = { ...failedTask, status: "scheduled" as const, error: "" };
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/schedules/run-due") {
        return { ok: true, json: async () => ({ results: [], tasks: [failedTask] }) };
      }
      return {
        ok: true,
        json: async () => ({ task: retriedTask, tasks: [retriedTask] }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GenerateStudio aiModel="gpt-5.4" aiReady wechatReady initialTasks={[failedTask]} />);

    expect(screen.getByText("失败")).toBeInTheDocument();
    expect(screen.getAllByText("模型 API Key 未配置").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "失败重试" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/schedules/schedule_failed/retry", { method: "POST" });
    expect(await screen.findByText("待执行")).toBeInTheDocument();
  });
});

function runDueResponse() {
  return {
    ok: true,
    json: async () => ({ results: [], tasks: [] }),
  };
}

function scheduledTask(input: Partial<ScheduledArticleTask>): ScheduledArticleTask {
  return {
    id: input.id ?? "schedule_1",
    name: input.name ?? "AI Agent 定时生成",
    status: input.status ?? "scheduled",
    scheduleType: input.scheduleType ?? "once",
    scheduledAt: input.scheduledAt ?? "2026-05-22T01:30:00.000Z",
    nextRunAt: input.nextRunAt ?? "2026-05-22T01:30:00.000Z",
    lastRunAt: input.lastRunAt ?? "",
    input: input.input ?? {
      title: "AI Agent 落地复盘",
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
    },
    draftId: input.draftId,
    error: input.error ?? "",
    runCount: input.runCount ?? 0,
    createdAt: input.createdAt ?? "2026-05-21T08:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-05-21T08:00:00.000Z",
    runs: input.runs,
  };
}
