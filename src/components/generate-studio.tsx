"use client";

import Link from "next/link";
import { CheckCircle2, Clock, Copy, FileText, Play, RefreshCw, Send, Settings, Sparkles } from "lucide-react";
import { startTransition, useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ScheduledArticleTask } from "@/lib/scheduled-generation";
import type { LocalDraft } from "@/lib/types";
import type {
  GeneratedWeChatArticle,
  WeChatGenerateArticleType,
  WeChatGenerateLength,
  WeChatGenerateMode,
} from "@/lib/wechat-generator";

type GenerateStudioProps = {
  aiModel: string;
  aiReady: boolean;
  wechatReady: boolean;
  initialTasks?: ScheduledArticleTask[];
};

type Notice = {
  type: "ok" | "error" | "info";
  text: string;
};

type GeneratedPayload = {
  article: GeneratedWeChatArticle;
  draft: LocalDraft;
};

type OptionState = {
  quoteTitle: boolean;
  addEmoji: boolean;
  addHashtags: boolean;
  filterSensitiveWords: boolean;
  filterMarketingWords: boolean;
};

type BusyAction = "generate" | "schedule" | "run-due" | "wechat" | "copy" | `run-${string}` | `retry-${string}`;

const initialOptions: OptionState = {
  quoteTitle: false,
  addEmoji: true,
  addHashtags: true,
  filterSensitiveWords: true,
  filterMarketingWords: true,
};

export function GenerateStudio({ aiModel, aiReady, wechatReady, initialTasks = [] }: GenerateStudioProps) {
  const [mode, setMode] = useState<WeChatGenerateMode>("new-title");
  const [articleType, setArticleType] = useState<WeChatGenerateArticleType>("share");
  const [length, setLength] = useState<WeChatGenerateLength>("xlong");
  const [scheduleType, setScheduleType] = useState<"once" | "daily" | "weekly">("once");
  const [options, setOptions] = useState<OptionState>(initialOptions);
  const [tasks, setTasks] = useState<ScheduledArticleTask[]>(initialTasks);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(
    aiReady
      ? { type: "info", text: `当前模型：${aiModel || "未命名模型"}，可以立即生成或创建定时任务。` }
      : { type: "error", text: "请先去配置中心填写文本模型和 API Key。" },
  );
  const [result, setResult] = useState<GeneratedPayload | null>(null);

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = buildGeneratePayload(new FormData(event.currentTarget));

    setBusy("generate");
    setNotice({ type: "info", text: "正在生成公众号正文，请稍等..." });
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    setBusy(null);
    if (!response.ok) {
      setNotice({ type: "error", text: data.error ?? "生成失败，请检查输入后重试。" });
      return;
    }
    startTransition(() => {
      setResult(data);
    });
    setNotice({ type: "ok", text: "公众号草稿已生成，支持复制或投递到微信草稿箱。" });
  }

  async function handleSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = buildGeneratePayload(form);
    const scheduledAt = String(form.get("scheduledAt") ?? "");
    const name = String(form.get("scheduleName") ?? "");

    setBusy("schedule");
    setNotice({ type: "info", text: "正在创建定时生成任务..." });
    const response = await fetch("/api/schedules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        scheduleType,
        scheduledAt,
        input: payload,
      }),
    });
    const data = await response.json();
    setBusy(null);
    if (!response.ok) {
      setNotice({ type: "error", text: data.error ?? "定时任务创建失败。" });
      return;
    }
    setTasks((current) => [data.task, ...current.filter((task) => task.id !== data.task.id)]);
    setNotice({ type: "ok", text: "定时生成任务已创建，到点后会生成本地草稿。" });
  }

  const runDueTasks = useCallback(async (options?: { quiet?: boolean }) => {
    if (!options?.quiet) {
      setBusy("run-due");
      setNotice({ type: "info", text: "正在扫描并执行到期任务..." });
    }
    const response = await fetch("/api/schedules/run-due", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!options?.quiet) {
      setBusy(null);
    }
    if (!response.ok) {
      if (!options?.quiet) {
        setNotice({ type: "error", text: data.error ?? "到期任务执行失败。" });
      }
      return;
    }
    if (Array.isArray(data.tasks)) {
      setTasks(data.tasks);
    }
    const generated = (data.results ?? []).filter((item: { draft?: LocalDraft | null }) => item.draft).length;
    if (!options?.quiet) {
      setNotice({ type: "ok", text: generated > 0 ? `已执行 ${generated} 个到期任务。` : "暂无到期任务。" });
    }
  }, []);

  useEffect(() => {
    if (!aiReady) {
      return;
    }
    const firstScan = window.setTimeout(() => {
      void runDueTasks({ quiet: true });
    }, 0);
    const timer = window.setInterval(() => {
      void runDueTasks({ quiet: true });
    }, 60_000);
    return () => {
      window.clearTimeout(firstScan);
      window.clearInterval(timer);
    };
  }, [aiReady, runDueTasks]);

  async function runTask(taskId: string) {
    setBusy(`run-${taskId}`);
    setNotice({ type: "info", text: "正在手动执行定时任务..." });
    const response = await fetch(`/api/schedules/${taskId}/run`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setNotice({ type: "error", text: data.error ?? "任务执行失败。" });
      return;
    }
    if (Array.isArray(data.tasks)) {
      setTasks(data.tasks);
    }
    if (data.draft) {
      setNotice({ type: "ok", text: `已生成草稿：${data.draft.title}` });
    } else if (data.task?.status === "failed") {
      setNotice({ type: "error", text: data.task.error || "任务执行失败。" });
    }
  }

  async function retryTask(taskId: string) {
    setBusy(`retry-${taskId}`);
    setNotice({ type: "info", text: "正在把失败任务放回待执行队列..." });
    const response = await fetch(`/api/schedules/${taskId}/retry`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setNotice({ type: "error", text: data.error ?? "重试失败。" });
      return;
    }
    if (Array.isArray(data.tasks)) {
      setTasks(data.tasks);
    }
    setNotice({ type: "ok", text: "任务已重新排队，可以等待自动执行或手动执行。" });
  }

  async function handleCopy() {
    if (!result) {
      return;
    }
    setBusy("copy");
    try {
      await navigator.clipboard.writeText(buildCopyText(result.article));
      setNotice({ type: "ok", text: "正文已复制到剪贴板。" });
    } catch {
      setNotice({ type: "error", text: "复制失败，请手动复制右侧结果。" });
    } finally {
      setBusy(null);
    }
  }

  async function handlePushWeChat() {
    if (!result) {
      return;
    }
    setBusy("wechat");
    setNotice({ type: "info", text: "正在投递到微信草稿箱..." });
    const response = await fetch(`/api/drafts/${result.draft.id}/wechat-draft`, {
      method: "POST",
    });
    const data = await response.json();
    setBusy(null);
    if (!response.ok || !data.ok) {
      setNotice({ type: "error", text: data.error ?? data.message ?? "微信草稿投递失败。" });
      return;
    }
    startTransition(() => {
      setResult((current) => (current ? { ...current, draft: data.draft ?? current.draft } : current));
    });
    setNotice({ type: "ok", text: data.message ?? "已投递到微信草稿箱。" });
  }

  function buildGeneratePayload(form: FormData) {
    return {
      title: String(form.get("title") ?? ""),
      mode,
      articleType,
      length,
      brief: String(form.get("brief") ?? ""),
      audience: String(form.get("audience") ?? ""),
      persona: String(form.get("persona") ?? ""),
      referenceNotes: String(form.get("referenceNotes") ?? ""),
      options,
    };
  }

  return (
    <main className="generate-shell" data-theme="light">
      <header className="generate-topbar">
        <div className="generate-brand">
          <div className="generate-badge">公众号工作站</div>
          <div>
            <h1>公众号生成工作站</h1>
            <p>即时生成、定时生成、状态日志和失败重试都集中在这里，先把内容生产闭环跑稳。</p>
          </div>
        </div>
        <div className="generate-topbar-actions">
          <Link href="/" className="generate-link-button">
            工作台
          </Link>
          <Link href="/settings" className="generate-icon-button" aria-label="打开配置中心">
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <section className="generate-layout">
        <form className="generate-form-card" onSubmit={handleGenerate}>
          <div className="generate-kicker-row">
            <span className="generate-kicker">创作配置</span>
            {notice ? <GenerateNotice notice={notice} /> : null}
          </div>

          <label className="generate-label" htmlFor="title">
            标题
          </label>
          <input
            id="title"
            name="title"
            className="field generate-field"
            placeholder="例如：为什么很多公司做不好 AI Agent 落地？"
            maxLength={60}
          />

          <fieldset className="generate-group">
            <legend>模式</legend>
            <div className="generate-chip-row">
              <ToggleChip active={mode === "new-title"} label="AI 生成新标题" onClick={() => setMode("new-title")} />
              <ToggleChip active={mode === "keep-title"} label="沿用原标题" onClick={() => setMode("keep-title")} />
            </div>
          </fieldset>

          <fieldset className="generate-group">
            <legend>类型</legend>
            <div className="generate-chip-row">
              <ChoiceChip active={articleType === "share"} label="分享" onClick={() => setArticleType("share")} />
              <ChoiceChip active={articleType === "guide"} label="攻略" onClick={() => setArticleType("guide")} />
              <ChoiceChip active={articleType === "tutorial"} label="教程" onClick={() => setArticleType("tutorial")} />
              <ChoiceChip active={articleType === "commerce"} label="电商" onClick={() => setArticleType("commerce")} />
              <ChoiceChip active={articleType === "review"} label="测评" onClick={() => setArticleType("review")} />
              <ChoiceChip active={articleType === "insight"} label="干货" onClick={() => setArticleType("insight")} />
              <ChoiceChip active={articleType === "free"} label="任意" onClick={() => setArticleType("free")} />
            </div>
          </fieldset>

          <fieldset className="generate-group">
            <legend>篇幅</legend>
            <div className="generate-chip-row">
              <ChoiceChip active={length === "short"} label="200 字" onClick={() => setLength("short")} />
              <ChoiceChip active={length === "medium"} label="300 字" onClick={() => setLength("medium")} />
              <ChoiceChip active={length === "long"} label="500 字" onClick={() => setLength("long")} />
              <ChoiceChip active={length === "xlong"} label="800 字" onClick={() => setLength("xlong")} />
              <ChoiceChip active={length === "free"} label="不限" onClick={() => setLength("free")} />
            </div>
          </fieldset>

          <fieldset className="generate-group">
            <legend>内容开关</legend>
            <div className="generate-option-grid">
              <CheckboxLine
                checked={options.quoteTitle}
                label="引用原标题关键词"
                onChange={() => setOptions((current) => ({ ...current, quoteTitle: !current.quoteTitle }))}
              />
              <CheckboxLine
                checked={options.addEmoji}
                label="添加少量表情"
                onChange={() => setOptions((current) => ({ ...current, addEmoji: !current.addEmoji }))}
              />
              <CheckboxLine
                checked={options.addHashtags}
                label="添加话题"
                onChange={() => setOptions((current) => ({ ...current, addHashtags: !current.addHashtags }))}
              />
              <CheckboxLine
                checked={options.filterSensitiveWords}
                label="过滤敏感词"
                onChange={() => setOptions((current) => ({ ...current, filterSensitiveWords: !current.filterSensitiveWords }))}
              />
              <CheckboxLine
                checked={options.filterMarketingWords}
                label="过滤营销词"
                onChange={() => setOptions((current) => ({ ...current, filterMarketingWords: !current.filterMarketingWords }))}
              />
            </div>
          </fieldset>

          <label className="generate-label" htmlFor="brief">
            内容方向
          </label>
          <textarea
            id="brief"
            name="brief"
            className="textarea generate-textarea"
            placeholder="想写什么、核心观点是什么、这篇文章要解决什么问题。"
            rows={4}
          />

          <div className="generate-two-col">
            <div>
              <label className="generate-label" htmlFor="audience">
                目标读者
              </label>
              <input id="audience" name="audience" className="field generate-field" placeholder="例如：创业者、运营负责人、AI 从业者" />
            </div>
            <div>
              <label className="generate-label" htmlFor="persona">
                账号人设
              </label>
              <input id="persona" name="persona" className="field generate-field" placeholder="例如：理性、专业、像一线操盘手" />
            </div>
          </div>

          <label className="generate-label" htmlFor="referenceNotes">
            补充背景
          </label>
          <textarea
            id="referenceNotes"
            name="referenceNotes"
            className="textarea generate-textarea generate-textarea-tall"
            placeholder="补充你掌握的背景、案例、产品卖点、活动信息、写作边界等。"
            rows={6}
          />

          <div className="generate-schedule-box">
            <div className="generate-schedule-heading">
              <Clock className="h-4 w-4" />
              <span>定时生成</span>
            </div>
            <label className="generate-label" htmlFor="scheduleName">
              任务名称
            </label>
            <input id="scheduleName" name="scheduleName" className="field generate-field" placeholder="例如：每周一 AI Agent 深度文" />
            <div className="generate-two-col">
              <label className="generate-label" htmlFor="scheduledAt">
                生成时间
                <input id="scheduledAt" name="scheduledAt" type="datetime-local" className="field generate-field" />
              </label>
              <fieldset className="generate-group generate-group-compact">
                <legend>频率</legend>
                <div className="generate-chip-row">
                  <ChoiceChip active={scheduleType === "once"} label="一次" onClick={() => setScheduleType("once")} />
                  <ChoiceChip active={scheduleType === "daily"} label="每天" onClick={() => setScheduleType("daily")} />
                  <ChoiceChip active={scheduleType === "weekly"} label="每周" onClick={() => setScheduleType("weekly")} />
                </div>
              </fieldset>
            </div>
          </div>

          <div className="generate-action-grid">
            <button type="submit" className="generate-submit-button" disabled={busy === "generate" || !aiReady}>
              {busy === "generate" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              立即生成正文
            </button>
            <button
              type="button"
              className="generate-secondary-button generate-schedule-button"
              disabled={busy === "schedule" || !aiReady}
              onClick={(event) => {
                const form = event.currentTarget.form;
                if (form) {
                  void handleSchedule({ preventDefault: () => undefined, currentTarget: form } as FormEvent<HTMLFormElement>);
                }
              }}
            >
              {busy === "schedule" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
              创建定时任务
            </button>
          </div>

          <div className="generate-tips">
            <p>定时任务会先生成本地草稿，不会自动发布；发布或投递微信草稿箱仍保留人工确认。</p>
            <p>页面打开时会自动扫描到期任务；以后部署到服务器后，也可以让 cron 调用同一个执行接口。</p>
          </div>
        </form>

        <section className="generate-right-column">
          <section className="generate-result-card">
            <div className="generate-result-header">
              <div>
                <div className="generate-kicker">生成结果</div>
                <h2>{result?.article.title ?? "等待生成"}</h2>
              </div>
              <div className="generate-result-actions">
                <button type="button" className="generate-secondary-button" onClick={handleCopy} disabled={!result || busy === "copy"}>
                  <Copy className="h-4 w-4" />
                  复制正文
                </button>
                <button
                  type="button"
                  className="generate-secondary-button"
                  onClick={handlePushWeChat}
                  disabled={!result || !wechatReady || busy === "wechat"}
                >
                  {busy === "wechat" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  投递微信草稿箱
                </button>
              </div>
            </div>

            {result ? (
              <>
                <div className="generate-metric-grid">
                  <MetricCard title="摘要" value={result.article.summary || "已生成"} icon={<FileText className="h-4 w-4" />} />
                  <MetricCard title="封面副标题" value={result.article.coverLine || result.article.deck || "已生成"} icon={<Sparkles className="h-4 w-4" />} />
                  <MetricCard
                    title="微信状态"
                    value={result.draft.wechatDraftStatus === "sent" ? "已投递" : "未投递"}
                    icon={<CheckCircle2 className="h-4 w-4" />}
                  />
                </div>

                {result.article.hashtags.length > 0 ? (
                  <div className="generate-tag-row" aria-label="推荐话题">
                    {result.article.hashtags.map((tag) => (
                      <span key={tag} className="generate-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="generate-copy-block">
                  <h3>封面文案</h3>
                  <p>{result.article.coverLine || result.article.deck || result.article.title}</p>
                </div>

                <article className="generate-article-preview" dangerouslySetInnerHTML={{ __html: result.article.bodyHtml }} />
              </>
            ) : (
              <div className="generate-empty-state">
                <p>填写左侧表单后，这里会展示生成后的标题、摘要和公众号正文。</p>
                <p>生成结果会自动保存为本地草稿，后续可继续投递到微信草稿箱。</p>
              </div>
            )}
          </section>

          <SchedulePanel
            busy={busy}
            onRetry={retryTask}
            onRun={runTask}
            onRunDue={() => runDueTasks()}
            tasks={tasks}
          />
        </section>
      </section>
    </main>
  );
}

function SchedulePanel({
  busy,
  onRetry,
  onRun,
  onRunDue,
  tasks,
}: {
  busy: BusyAction | null;
  onRetry: (taskId: string) => void;
  onRun: (taskId: string) => void;
  onRunDue: () => void;
  tasks: ScheduledArticleTask[];
}) {
  return (
    <section className="generate-result-card generate-schedule-panel">
      <div className="generate-result-header">
        <div>
          <div className="generate-kicker">定时任务</div>
          <h2>内容生产队列</h2>
        </div>
        <button type="button" className="generate-secondary-button" disabled={busy === "run-due"} onClick={onRunDue}>
          {busy === "run-due" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          扫描到期任务
        </button>
      </div>

      {tasks.length > 0 ? (
        <div className="generate-task-list">
          {tasks.map((task) => (
            <article key={task.id} className="generate-task-card">
              <div className="generate-task-header">
                <div>
                  <h3>{task.name}</h3>
                  <p>{task.input.title}</p>
                </div>
                <span className={`generate-task-status generate-task-status-${task.status}`}>{statusLabel(task.status)}</span>
              </div>
              <div className="generate-task-meta">
                <span>{scheduleTypeLabel(task.scheduleType)}</span>
                <span>下次：{formatDateTime(task.nextRunAt) || "无"}</span>
                <span>运行：{task.runCount} 次</span>
              </div>
              {task.error ? <p className="generate-task-error">{task.error}</p> : null}
              <div className="generate-result-actions">
                <button type="button" className="generate-secondary-button" disabled={busy === `run-${task.id}`} onClick={() => onRun(task.id)}>
                  {busy === `run-${task.id}` ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  立即执行
                </button>
                <button
                  type="button"
                  className="generate-secondary-button"
                  disabled={task.status !== "failed" || busy === `retry-${task.id}`}
                  onClick={() => onRetry(task.id)}
                >
                  {busy === `retry-${task.id}` ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  失败重试
                </button>
              </div>
              {task.runs && task.runs.length > 0 ? (
                <div className="generate-run-log">
                  {task.runs.map((run) => (
                    <div key={run.id} className="generate-run-row">
                      <span className={`generate-run-dot generate-run-dot-${run.status}`} />
                      <span>{formatDateTime(run.startedAt)}</span>
                      <span>{run.status === "completed" ? run.message || "已完成" : run.error || run.message || "执行中"}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="generate-empty-state">
          <p>还没有定时任务。填写左侧创作配置和生成时间后，点击“创建定时任务”。</p>
        </div>
      )}
    </section>
  );
}

function ToggleChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className={active ? "generate-chip generate-chip-active" : "generate-chip"} onClick={onClick}>
      {label}
    </button>
  );
}

function ChoiceChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className={active ? "generate-choice generate-choice-active" : "generate-choice"} onClick={onClick}>
      {label}
    </button>
  );
}

function CheckboxLine({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <label className="generate-checkbox-line">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function MetricCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="generate-metric-card">
      <div className="generate-metric-title">
        {icon}
        <span>{title}</span>
      </div>
      <p>{value}</p>
    </div>
  );
}

function GenerateNotice({ notice }: { notice: Notice }) {
  return <div className={`generate-notice generate-notice-${notice.type}`}>{notice.text}</div>;
}

function buildCopyText(article: GeneratedWeChatArticle): string {
  return [
    article.title,
    article.deck ? `\n${article.deck}` : "",
    `\n${article.plainText}`,
    article.hashtags.length > 0 ? `\n${article.hashtags.join(" ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function statusLabel(status: ScheduledArticleTask["status"]): string {
  switch (status) {
    case "scheduled":
      return "待执行";
    case "running":
      return "执行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "paused":
      return "已暂停";
  }
}

function scheduleTypeLabel(value: ScheduledArticleTask["scheduleType"]): string {
  switch (value) {
    case "daily":
      return "每天";
    case "weekly":
      return "每周";
    default:
      return "一次";
  }
}

function formatDateTime(value?: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
