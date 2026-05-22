import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Workbench } from "@/components/workbench";
import { ANALYSIS_TEMPLATES } from "@/lib/analysis";
import { THEME_COOKIE_NAME, THEME_STORAGE_KEY } from "@/lib/theme";
import type { Article, WritingBlueprint, WritingStructureRun } from "@/lib/types";

const articles: Article[] = [
  {
    id: "art_agent",
    title: "Agent 工程化成本拆解",
    sourceType: "web",
    sourceName: "AI Systems",
    sourceAccount: "AI Systems",
    originalUrl: "https://mp.weixin.qq.com/s/agent",
    author: "Lin",
    publishedAt: "2026-05-10",
    contentHtml: "<p>Agent 成本来自工具调用和上下文膨胀。</p>",
    contentText: "Agent 成本来自工具调用和上下文膨胀。".repeat(20),
    content: "Agent 成本来自工具调用和上下文膨胀。".repeat(20),
    category: "AI Agent",
    isFavorite: false,
    tags: ["agent", "成本"],
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z",
  },
  {
    id: "art_rag",
    title: "RAG 评测体系",
    sourceType: "web",
    sourceName: "LLM Lab",
    sourceAccount: "LLM Lab",
    originalUrl: "https://mp.weixin.qq.com/s/rag",
    author: "Chen",
    publishedAt: "2026-05-11",
    contentHtml: "<p>RAG 评测需要覆盖召回、重排和答案事实性。</p>",
    contentText: "RAG 评测需要覆盖召回、重排和答案事实性。",
    content: "RAG 评测需要覆盖召回、重排和答案事实性。",
    category: "AI 研究",
    isFavorite: false,
    tags: ["rag", "评测"],
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z",
  },
];

const structureRun: WritingStructureRun = {
  id: "wstruct_agent",
  articleId: "art_agent",
  structure: {
    titlePattern: "问题场景 + 工程闭环判断",
    openingHook: "从 Agent 项目上线后的成本失控切入",
    pressurePoint: "只会调 API 的团队会卡在权限、评测和上下文成本",
    ethicalRewrite: "不要制造淘汰焦虑，要给出工程补课路径",
    technicalBackbone: ["工具权限", "状态管理", "评估闭环"],
    evidencePattern: ["用失败模式说明问题", "用指标约束判断"],
    pacingPattern: "场景开头后进入框架，再给项目建议",
    reusableMoves: ["先给真实卡点", "把焦虑改写成行动清单"],
    antiPatterns: ["再不学就淘汰", "加微信领取资料"],
  },
  qualityScore: 91,
  modelMetadata: { provider: "openai-compatible", model: "gpt-5.4" },
  createdAt: "2026-05-18T08:00:00.000Z",
};

const writingBlueprint: WritingBlueprint = {
  id: "wblue_agent",
  name: "Agent 工程闭环蓝图",
  sourceArticleIds: ["art_agent"],
  summary: "从真实项目卡点进入，给工程框架和迁移建议。",
  sectionPlan: [
    { title: "真实场景", purpose: "开场", guidance: "用上线卡点进入" },
    { title: "工程框架", purpose: "主体", guidance: "拆权限、状态、评估" },
  ],
  toneRules: ["克制", "给证据"],
  bannedExpressions: ["加微信"],
  modelMetadata: { provider: "openai-compatible", model: "gpt-5.4" },
  createdAt: "2026-05-18T08:00:00.000Z",
  updatedAt: "2026-05-18T08:00:00.000Z",
};

async function openReaderActions() {
  await userEvent.click(screen.getByRole("button", { name: "文章操作" }));
}

async function clickReaderAction(name: string) {
  await openReaderActions();
  await userEvent.click(screen.getByRole("button", { name }));
}

async function openReaderFilters() {
  await userEvent.click(screen.getByRole("button", { name: /^筛选/ }));
}

describe("Workbench", () => {
  let storageState: Map<string, string>;

  beforeEach(() => {
    storageState = new Map();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => storageState.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storageState.set(key, value);
        }),
        removeItem: vi.fn((key: string) => {
          storageState.delete(key);
        }),
        clear: vi.fn(() => {
          storageState.clear();
        }),
      },
    });
    document.cookie = `${THEME_COOKIE_NAME}=; Max-Age=0; Path=/`;
  });

  afterEach(() => {
    document.cookie = `${THEME_COOKIE_NAME}=; Max-Age=0; Path=/`;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("filters article list and keeps the reading pane usable for long content", async () => {
    render(
      <Workbench
        initialArticles={articles}
        templates={ANALYSIS_TEMPLATES}
        initialAiSettings={{ baseUrl: "", apiKey: "", model: "" }}
        initialImageSettings={{
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-image-2",
          size: "1536x1024",
          hasApiKey: false,
        }}
        initialWeChatConfig={{
          appId: "",
          appSecret: "",
          tokenStatus: "unchecked",
          lastCheckResult: "",
          updatedAt: "",
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "技术文章库" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "微信公众号" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开配置中心" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("main")).toHaveAttribute("data-theme", "light");
    await userEvent.click(screen.getByRole("button", { name: "切换到深色模式" }));
    expect(screen.getByRole("main")).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.cookie).toContain(`${THEME_COOKIE_NAME}=dark`);
    await userEvent.click(screen.getByRole("button", { name: "切换到浅色模式" }));
    expect(screen.getByRole("main")).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.cookie).toContain(`${THEME_COOKIE_NAME}=light`);
    expect(screen.getByRole("heading", { name: "Agent 工程化成本拆解" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^筛选/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文章操作" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "管理文章" })).not.toBeInTheDocument();
    await openReaderActions();
    expect(screen.getByRole("button", { name: "管理文章" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑正文" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 拆解" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增文章" })).toBeInTheDocument();
    expect(screen.getByText("显示 2 / 2 篇")).toBeInTheDocument();
    await openReaderFilters();
    expect(screen.getByLabelText("分类")).toBeInTheDocument();
    expect(screen.getByLabelText("来源")).toBeInTheDocument();
    expect(screen.getByLabelText("排序")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成拆解" })).not.toBeInTheDocument();
    expect(screen.queryByText("高级处理")).not.toBeInTheDocument();
    expect(screen.queryByText("手动粘贴")).not.toBeInTheDocument();
    const reader = screen.getByRole("article");
    expect(within(reader).queryByText("保存摘要")).not.toBeInTheDocument();
    expect(within(reader).queryByText("来源：AI Systems")).not.toBeInTheDocument();
    expect(within(reader).queryByText("作者：Lin")).not.toBeInTheDocument();
    expect(within(reader).queryByText("2026-05-10")).not.toBeInTheDocument();
    expect(within(reader).getByText("Agent 成本来自工具调用和上下文膨胀。")).toBeInTheDocument();
    expect(screen.queryByText("智能处理 Agent")).not.toBeInTheDocument();
    expect(screen.queryByText("微信后台")).not.toBeInTheDocument();

    await openReaderActions();
    await userEvent.click(screen.getByRole("button", { name: "AI 拆解" }));
    const analysisDialog = screen.getByRole("dialog", { name: "AI 拆解" });
    expect(within(analysisDialog).getByRole("button", { name: "生成拆解" })).toBeInTheDocument();
    expect(within(analysisDialog).getByText("高级处理")).toBeInTheDocument();
    await userEvent.click(within(analysisDialog).getByRole("button", { name: "关闭" }));

    await clickReaderAction("新增文章");
    const importDialog = screen.getByRole("dialog", { name: "新增文章" });
    expect(within(importDialog).getByRole("button", { name: "链接导入" })).toBeInTheDocument();
    expect(within(importDialog).getByRole("button", { name: "手动粘贴" })).toBeInTheDocument();
    await userEvent.click(within(importDialog).getByRole("button", { name: "关闭" }));

    await openReaderFilters();
    await userEvent.selectOptions(screen.getByLabelText("分类"), "AI 研究");

    expect(screen.queryByText("Agent 工程化成本拆解")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "RAG 评测体系" })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("分类"), "全部");
    await userEvent.type(screen.getByPlaceholderText("搜索标题、来源、标签、正文"), "RAG");

    expect(screen.queryByText("Agent 工程化成本拆解")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "RAG 评测体系" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "清除检索条件" }));
    await userEvent.type(screen.getByPlaceholderText("搜索标题、来源、标签、正文"), "事实性");
    expect(screen.queryByText("Agent 工程化成本拆解")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "RAG 评测体系" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "打开文章：RAG 评测体系" }));
    expect(screen.getByRole("heading", { name: "RAG 评测体系" })).toBeInTheDocument();
    expect(within(screen.getByRole("article")).queryByText("来源：LLM Lab")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "运行高级处理" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "微信公众号" }));

    expect(screen.getByRole("heading", { name: "微信公众号生成" })).toBeInTheDocument();
    expect(screen.getByText("当前素材")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /生成专业长文/ })).toBeInTheDocument();
    expect(screen.queryByText("图片模型配置")).not.toBeInTheDocument();
    expect(screen.queryByText("微信后台")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新增文章" })).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByText("Agent 成本来自工具调用和上下文膨胀。")).not.toBeInTheDocument();
  });

  it("collapses the article rail into a drawer and restores article selection from it", async () => {
    render(
      <Workbench
        initialArticles={articles}
        templates={ANALYSIS_TEMPLATES}
        initialAiSettings={{ baseUrl: "", apiKey: "", model: "" }}
        initialImageSettings={{
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-image-2",
          size: "1536x1024",
          hasApiKey: false,
        }}
        initialWeChatConfig={{
          appId: "",
          appSecret: "",
          tokenStatus: "unchecked",
          lastCheckResult: "",
          updatedAt: "",
        }}
      />,
    );

    expect(screen.getByText("显示 2 / 2 篇")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "收起文章栏" }));

    expect(screen.queryByText("显示 2 / 2 篇")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开文章栏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "从左侧展开文章栏" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "从左侧展开文章栏" }));
    const drawer = screen.getByRole("dialog", { name: "文章列表" });
    expect(within(drawer).getByPlaceholderText("搜索标题、来源、标签、正文")).toBeInTheDocument();
    expect(within(drawer).getByText("显示 2 / 2 篇")).toBeInTheDocument();

    await userEvent.click(within(drawer).getByRole("button", { name: "打开文章：RAG 评测体系" }));

    expect(screen.queryByRole("dialog", { name: "文章列表" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "RAG 评测体系" })).toBeInTheDocument();
  });

  it("lets users favorite articles and filter the library to favorites", async () => {
    const favoritedArticle: Article = {
      ...articles[0],
      isFavorite: true,
      updatedAt: "2026-05-16T00:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ article: favoritedArticle }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Workbench
        initialArticles={articles}
        templates={ANALYSIS_TEMPLATES}
        initialAiSettings={{ baseUrl: "", apiKey: "", model: "" }}
        initialImageSettings={{
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-image-2",
          size: "1536x1024",
          hasApiKey: false,
        }}
        initialWeChatConfig={{
          appId: "",
          appSecret: "",
          tokenStatus: "unchecked",
          lastCheckResult: "",
          updatedAt: "",
        }}
      />,
    );

    await clickReaderAction("特别收藏当前文章");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/articles/art_agent",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"isFavorite":true'),
      }),
    );
    expect(await screen.findByText("已加入特别收藏：Agent 工程化成本拆解")).toBeInTheDocument();
    await openReaderActions();
    expect(screen.getByRole("button", { name: "取消特别收藏当前文章" })).toBeInTheDocument();

    await openReaderFilters();
    await userEvent.click(screen.getByRole("button", { name: "只看特别收藏" }));

    expect(screen.getByText("显示 1 / 2 篇")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Agent 工程化成本拆解" })).toBeInTheDocument();
    expect(screen.queryByText("RAG 评测体系")).not.toBeInTheDocument();
  });

  it("lets users auto-crop imported boilerplate and save the article body", async () => {
    const noisyArticle: Article = {
      ...articles[0],
      id: "art_noisy",
      title: "带杂项的公众号文章",
      contentHtml:
        '<p>充中 发自 凹非寺</p><p>量子位 | 公众号 QbitAI</p><p style="font-size:18px">真正需要保留的技术正文，包含<strong>架构</strong>、评测、缓存和回滚。</p><ul><li>保留新增项</li></ul><p>第二段正文继续说明工程现场。</p><p><img src="https://example.com/diagram.png" alt="架构图" /></p><p>一键三连「点赞」「转发」「小心心」</p><p>欢迎在评论区留下你的想法！</p>',
      contentText:
        "充中 发自 凹非寺 量子位 | 公众号 QbitAI 真正需要保留的技术正文，包含架构、评测、缓存和回滚。第二段正文继续说明工程现场。一键三连 欢迎在评论区留下你的想法！",
    };
    const cleanedArticle: Article = {
      ...noisyArticle,
      contentHtml: "<p>真正需要保留的技术正文，包含架构、评测、缓存和回滚。</p><p>第二段正文继续说明工程现场。</p>",
      contentText: "真正需要保留的技术正文，包含架构、评测、缓存和回滚。 第二段正文继续说明工程现场。",
      updatedAt: "2026-05-15T00:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ article: cleanedArticle }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Workbench
        initialArticles={[noisyArticle]}
        templates={ANALYSIS_TEMPLATES}
        initialAiSettings={{ baseUrl: "", apiKey: "", model: "" }}
        initialImageSettings={{
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-image-2",
          size: "1536x1024",
          hasApiKey: false,
        }}
        initialWeChatConfig={{
          appId: "",
          appSecret: "",
          tokenStatus: "unchecked",
          lastCheckResult: "",
          updatedAt: "",
        }}
      />,
    );

    await clickReaderAction("编辑正文");
    const dialog = screen.getByRole("dialog", { name: "编辑正文" });
    await userEvent.click(within(dialog).getByRole("button", { name: "自动裁剪杂项" }));

    const contentInput = within(dialog).getByRole("textbox", { name: "正文" }) as HTMLElement;
    expect(contentInput.textContent).toContain("真正需要保留的技术正文");
    expect(contentInput.textContent).not.toContain("<p>");
    expect(contentInput.textContent).not.toContain("公众号 QbitAI");
    expect(contentInput.textContent).not.toContain("一键三连");
    expect(contentInput.innerHTML).toContain("<strong>");
    expect(contentInput.innerHTML).toContain("<ul>");
    expect(contentInput.innerHTML).toContain('src="https://example.com/diagram.png"');

    await userEvent.click(within(dialog).getByRole("button", { name: "保存正文" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/articles/art_noisy",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"contentHtml"'),
      }),
    );
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(requestBody.contentText).toBeUndefined();
    expect(requestBody.contentHtml).toContain("<strong>");
    expect(requestBody.contentHtml).toContain("<ul>");
    expect(requestBody.contentHtml).toContain('src="https://example.com/diagram.png"');
    expect(requestBody.contentHtml).not.toContain("公众号 QbitAI");
    await screen.findByText("正文已更新");
    expect(screen.getByText("真正需要保留的技术正文，包含架构、评测、缓存和回滚。")).toBeInTheDocument();
  });

  it("keeps the rich text editor stable when users delete the body content", async () => {
    render(
      <Workbench
        initialArticles={articles}
        templates={ANALYSIS_TEMPLATES}
        initialAiSettings={{ baseUrl: "", apiKey: "", model: "" }}
        initialImageSettings={{
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-image-2",
          size: "1536x1024",
          hasApiKey: false,
        }}
        initialWeChatConfig={{
          appId: "",
          appSecret: "",
          tokenStatus: "unchecked",
          lastCheckResult: "",
          updatedAt: "",
        }}
      />,
    );

    await clickReaderAction("编辑正文");
    const dialog = screen.getByRole("dialog", { name: "编辑正文" });
    const contentInput = within(dialog).getByRole("textbox", { name: "正文" }) as HTMLElement;
    contentInput.innerHTML = "";

    expect(() => fireEvent.input(contentInput)).not.toThrow();
    expect(contentInput.innerHTML).toBe("");
  });

  it("manages article categories with manual saves and smart suggestions", async () => {
    const updatedArticle: Article = {
      ...articles[0],
      category: "期货",
      updatedAt: "2026-05-15T00:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ article: updatedArticle }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Workbench
        initialArticles={articles}
        templates={ANALYSIS_TEMPLATES}
        initialAiSettings={{ baseUrl: "", apiKey: "", model: "" }}
        initialImageSettings={{
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-image-2",
          size: "1536x1024",
          hasApiKey: false,
        }}
        initialWeChatConfig={{
          appId: "",
          appSecret: "",
          tokenStatus: "unchecked",
          lastCheckResult: "",
          updatedAt: "",
        }}
      />,
    );

    await clickReaderAction("管理文章");
    const dialog = screen.getByRole("dialog", { name: "文章管理" });
    expect(within(dialog).getByRole("button", { name: "全部智能分类" })).toBeInTheDocument();

    const row = within(dialog).getByText("Agent 工程化成本拆解").closest("form");
    expect(row).not.toBeNull();
    const categoryInput = within(row as HTMLFormElement).getByDisplayValue("AI Agent");
    fireEvent.change(categoryInput, { target: { value: "期货" } });
    await userEvent.click(within(row as HTMLFormElement).getByRole("button", { name: "保存" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/articles/art_agent",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"category":"期货"'),
      }),
    );
    expect(await screen.findByText("已更新分类：期货")).toBeInTheDocument();
  });

  it("deletes an article from the management panel after inline confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Workbench
        initialArticles={articles}
        templates={ANALYSIS_TEMPLATES}
        initialAiSettings={{ baseUrl: "", apiKey: "", model: "" }}
        initialImageSettings={{
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-image-2",
          size: "1536x1024",
          hasApiKey: false,
        }}
        initialWeChatConfig={{
          appId: "",
          appSecret: "",
          tokenStatus: "unchecked",
          lastCheckResult: "",
          updatedAt: "",
        }}
      />,
    );

    await clickReaderAction("管理文章");
    const dialog = screen.getByRole("dialog", { name: "文章管理" });
    const row = within(dialog).getByText("Agent 工程化成本拆解").closest("form");
    expect(row).not.toBeNull();

    await userEvent.click(within(row as HTMLFormElement).getByRole("button", { name: "删除" }));
    expect(screen.getByText("再次点击确认删除：Agent 工程化成本拆解")).toBeInTheDocument();
    await userEvent.click(within(row as HTMLFormElement).getByRole("button", { name: "确认删除" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/library/articles/art_agent", { method: "DELETE" });
    expect(await screen.findByText("已删除文章：Agent 工程化成本拆解")).toBeInTheDocument();
    expect(within(dialog).queryByText("Agent 工程化成本拆解")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "RAG 评测体系" })).toBeInTheDocument();
  });

  it("saves a manually pasted article into the local library and selects it", async () => {
    const importedArticle: Article = {
      ...articles[0],
      id: "art_new",
      title: "上下文工程实践",
      sourceName: "Local Notes",
      sourceAccount: "Local Notes",
      originalUrl: "local://context-engineering",
      author: "Wang",
      publishedAt: "2026-05-12",
      contentHtml: "上下文工程需要把需求、工具和验证组合成稳定流程。",
      contentText: "上下文工程需要把需求、工具和验证组合成稳定流程。",
      content: "上下文工程需要把需求、工具和验证组合成稳定流程。",
      tags: ["上下文", "工程化"],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ article: importedArticle }),
      }),
    );

    render(
      <Workbench
        initialArticles={articles}
        templates={ANALYSIS_TEMPLATES}
        initialAiSettings={{ baseUrl: "", apiKey: "", model: "" }}
        initialImageSettings={{
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-image-2",
          size: "1536x1024",
          hasApiKey: false,
        }}
        initialWeChatConfig={{
          appId: "",
          appSecret: "",
          tokenStatus: "unchecked",
          lastCheckResult: "",
          updatedAt: "",
        }}
      />,
    );

    await clickReaderAction("新增文章");
    const importDialog = screen.getByRole("dialog", { name: "新增文章" });
    await userEvent.click(within(importDialog).getByRole("button", { name: "手动粘贴" }));
    await userEvent.type(screen.getByPlaceholderText("标题"), "上下文工程实践");
    await userEvent.type(screen.getByPlaceholderText("来源名称"), "Local Notes");
    await userEvent.type(screen.getByPlaceholderText("文章链接"), "local://context-engineering");
    await userEvent.type(screen.getByPlaceholderText("正文"), "上下文工程需要把需求、工具和验证组合成稳定流程。");
    await userEvent.click(screen.getByRole("button", { name: "保存到本地库" }));

    expect(await screen.findByRole("heading", { name: "上下文工程实践" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "新增文章" })).not.toBeInTheDocument();
    expect(screen.getByText("已保存到本地库：上下文工程实践")).toBeInTheDocument();
    expect(within(screen.getByRole("article")).queryByText("来源：Local Notes")).not.toBeInTheDocument();
    expect(within(screen.getByRole("article")).getByText("上下文工程需要把需求、工具和验证组合成稳定流程。")).toBeInTheDocument();
  });

  it("imports a URL article without reading a stale form event after await", async () => {
    const importedArticle: Article = {
      id: "art_imported_url",
      title: "Hugging Face 评估指南",
      sourceType: "web",
      sourceName: "Hugging Face",
      sourceAccount: "Hugging Face",
      originalUrl: "https://huggingface.co/blog/eval-guidebook",
      author: "HF",
      publishedAt: "2026-05-15",
      contentHtml: "<p>LLM evaluation needs lifecycle thinking.</p>",
      contentText: "LLM evaluation needs lifecycle thinking.",
      content: "LLM evaluation needs lifecycle thinking.",
      category: "AI 研究",
      isFavorite: false,
      tags: ["eval", "llm"],
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ ok: true, article: importedArticle }),
      }),
    );

    render(
      <Workbench
        initialArticles={[]}
        templates={ANALYSIS_TEMPLATES}
        initialAiSettings={{ baseUrl: "", apiKey: "", model: "" }}
        initialImageSettings={{
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-image-2",
          size: "1536x1024",
          hasApiKey: false,
        }}
        initialWeChatConfig={{
          appId: "",
          appSecret: "",
          tokenStatus: "unchecked",
          lastCheckResult: "",
          updatedAt: "",
        }}
      />,
    );

    await clickReaderAction("新增文章");
    await userEvent.type(screen.getByPlaceholderText("粘贴文章链接后解析"), importedArticle.originalUrl);
    await userEvent.click(screen.getByRole("button", { name: "链接解析" }));

    expect(await screen.findByRole("heading", { name: "Hugging Face 评估指南" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "新增文章" })).not.toBeInTheDocument();
    expect(screen.getByText("已保存到本地库：Hugging Face 评估指南")).toBeInTheDocument();
  });

  it("clears successful import notices after a short delay", async () => {
    vi.useFakeTimers();
    const importedArticle: Article = {
      ...articles[0],
      id: "art_transient",
      title: "短提示测试",
      sourceName: "Notice Lab",
      sourceAccount: "Notice Lab",
      originalUrl: "https://example.com/transient",
      contentHtml: "短提示测试正文",
      contentText: "短提示测试正文",
      content: "短提示测试正文",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ ok: true, article: importedArticle }),
      }),
    );

    render(
      <Workbench
        initialArticles={[]}
        templates={ANALYSIS_TEMPLATES}
        initialAiSettings={{ baseUrl: "", apiKey: "", model: "" }}
        initialImageSettings={{
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-image-2",
          size: "1536x1024",
          hasApiKey: false,
        }}
        initialWeChatConfig={{
          appId: "",
          appSecret: "",
          tokenStatus: "unchecked",
          lastCheckResult: "",
          updatedAt: "",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "文章操作" }));
    fireEvent.click(screen.getByRole("button", { name: "新增文章" }));
    fireEvent.change(screen.getByPlaceholderText("粘贴文章链接后解析"), {
      target: { value: importedArticle.originalUrl },
    });
    fireEvent.click(screen.getByRole("button", { name: "链接解析" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole("dialog", { name: "新增文章" })).not.toBeInTheDocument();
    expect(screen.getByText("已保存到本地库：短提示测试")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(screen.queryByText("已保存到本地库：短提示测试")).not.toBeInTheDocument();
  });

  it("normalizes imported HTML while keeping safe article images readable", () => {
    const { container } = render(
      <Workbench
        initialArticles={[
          {
            ...articles[0],
            id: "art_html",
            title: "外部 HTML 阅读测试",
            contentHtml:
              '<section style="color:#000;background:#fff"><div class="layout-shell"><p style="color:#000">黑字正文 <strong style="color:#6b4cff">关键词</strong></p><p><br /></p><button><span>轮播按钮</span></button><figure><img src="https://example.com/diagram.png" alt="架构图" style="width:9999px" /><figcaption class="caption">架构图说明</figcaption></figure><table class="grid"><tbody><tr><th>列名</th><td>表格内容</td></tr></tbody></table><img src="javascript:alert(1)" alt="坏图" /></div></section>',
          },
        ]}
        templates={ANALYSIS_TEMPLATES}
        initialAiSettings={{ baseUrl: "", apiKey: "", model: "" }}
        initialImageSettings={{
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-image-2",
          size: "1536x1024",
          hasApiKey: false,
        }}
        initialWeChatConfig={{
          appId: "",
          appSecret: "",
          tokenStatus: "unchecked",
          lastCheckResult: "",
          updatedAt: "",
        }}
      />,
    );

    expect(screen.getByText(/黑字正文/).closest("p")).not.toHaveAttribute("style");
    expect(screen.getByRole("img", { name: "架构图" })).toHaveAttribute("src", "https://example.com/diagram.png");
    expect(screen.getByRole("img", { name: "架构图" })).not.toHaveAttribute("style");
    expect(screen.getByText("架构图说明")).toBeInTheDocument();
    expect(screen.getByText("表格内容").closest("table")).toBeInTheDocument();
    expect(screen.queryByText("轮播按钮")).not.toBeInTheDocument();
    expect(screen.queryByAltText("坏图")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".article-html p")).toHaveLength(1);
  });

  it("keeps URL parse failures inside the unified add article panel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({
          ok: false,
          reason: "无法解析文章正文，请改用手动粘贴",
          fallback: {
            title: "",
            sourceName: "",
            sourceType: "web",
            originalUrl: "https://example.com/blocked",
            author: "",
            publishedAt: "",
            contentText: "",
            tags: [],
          },
        }),
      }),
    );

    render(
      <Workbench
        initialArticles={articles}
        templates={ANALYSIS_TEMPLATES}
        initialAiSettings={{ baseUrl: "", apiKey: "", model: "" }}
        initialImageSettings={{
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-image-2",
          size: "1536x1024",
          hasApiKey: false,
        }}
        initialWeChatConfig={{
          appId: "",
          appSecret: "",
          tokenStatus: "unchecked",
          lastCheckResult: "",
          updatedAt: "",
        }}
      />,
    );

    await clickReaderAction("新增文章");
    await userEvent.type(screen.getByPlaceholderText("粘贴文章链接后解析"), "https://example.com/blocked");
    await userEvent.click(screen.getByRole("button", { name: "链接解析" }));

    const importDialog = screen.getByRole("dialog", { name: "新增文章" });
    expect(await within(importDialog).findByText("无法解析文章正文，请改用手动粘贴")).toBeInTheDocument();
    expect(within(importDialog).getByRole("button", { name: "手动粘贴" })).toBeInTheDocument();
  });

  it("generates an original WeChat draft from a topic and selected references", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        draft: {
          id: "draft_original",
          title: "想转 Agent 工程师，先补齐工程闭环",
          body: "<h1>想转 Agent 工程师，先补齐工程闭环</h1><p>真正的差距在工程闭环。</p>",
          sourceAnalysisIds: [],
          exportFormat: "html",
          wechatDraftStatus: "not_sent",
          createdAt: "now",
          updatedAt: "now",
        },
        warnings: [
          {
            sourceArticleId: "art_agent",
            sourceTitle: "Agent 工程化成本拆解",
            matchedText: "Agent 成本来自工具调用和上下文膨胀。",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Workbench
        initialArticles={articles}
        templates={ANALYSIS_TEMPLATES}
        initialAiSettings={{ baseUrl: "", apiKey: "", model: "" }}
        initialImageSettings={{
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-image-2",
          size: "1536x1024",
          hasApiKey: false,
        }}
        initialWeChatConfig={{
          appId: "",
          appSecret: "",
          tokenStatus: "unchecked",
          lastCheckResult: "",
          updatedAt: "",
        }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "微信公众号" }));
    expect(screen.getByRole("button", { name: "拆解当前文章结构" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "用所选文章生成结构蓝图" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("原创选题"), "想转 Agent 工程师，先补齐哪些工程能力？");
    await userEvent.click(screen.getByRole("button", { name: "根据选题生成原创文章" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/writing/drafts",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("想转 Agent 工程师"),
      }),
    );
    expect((await screen.findAllByText("想转 Agent 工程师，先补齐工程闭环")).length).toBeGreaterThan(0);
    expect(screen.getByText("疑似长句复用，需要人工改写")).toBeInTheDocument();
  });

  it("shows writing structure assets and the full WeChat agent pipeline", async () => {
    render(
      <Workbench
        initialArticles={articles}
        templates={ANALYSIS_TEMPLATES}
        initialWritingBlueprints={[writingBlueprint]}
        initialWritingStructureRuns={[structureRun]}
        initialAiSettings={{ baseUrl: "", apiKey: "", model: "" }}
        initialImageSettings={{
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-image-2",
          size: "1536x1024",
          hasApiKey: false,
        }}
        initialWeChatConfig={{
          appId: "",
          appSecret: "",
          tokenStatus: "unchecked",
          lastCheckResult: "",
          updatedAt: "",
        }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "微信公众号" }));

    const pipeline = screen.getByLabelText("公众号 Agent 流程");
    expect(within(pipeline).getByText("结构拆解 Agent")).toBeInTheDocument();
    expect(within(pipeline).getByText("写作蓝图 Agent")).toBeInTheDocument();
    expect(within(pipeline).getByText("原创写作 Agent")).toBeInTheDocument();
    expect(within(pipeline).getByText("专业长文配图 Agent")).toBeInTheDocument();

    const structurePanel = screen.getByLabelText("写作结构资产");
    expect(within(structurePanel).getByText("问题场景 + 工程闭环判断")).toBeInTheDocument();
    expect(within(structurePanel).getByText("工具权限")).toBeInTheDocument();
    expect(within(structurePanel).getByText("把焦虑改写成行动清单")).toBeInTheDocument();
    expect(within(structurePanel).getByText("再不学就淘汰")).toBeInTheDocument();

    const blueprintPreview = screen.getByLabelText("写作蓝图预览");
    expect(within(blueprintPreview).getByText("Agent 工程闭环蓝图")).toBeInTheDocument();
    expect(within(blueprintPreview).getByText("真实场景")).toBeInTheDocument();
  });

  it("renders a newly generated structure run immediately in the WeChat workspace", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ structureRun }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Workbench
        initialArticles={articles}
        templates={ANALYSIS_TEMPLATES}
        initialAiSettings={{ baseUrl: "", apiKey: "", model: "" }}
        initialImageSettings={{
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-image-2",
          size: "1536x1024",
          hasApiKey: false,
        }}
        initialWeChatConfig={{
          appId: "",
          appSecret: "",
          tokenStatus: "unchecked",
          lastCheckResult: "",
          updatedAt: "",
        }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "微信公众号" }));
    await userEvent.click(screen.getByRole("button", { name: "拆解当前文章结构" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/library/articles/art_agent/structure", { method: "POST" });
    await screen.findAllByText("问题场景 + 工程闭环判断");
    expect(within(screen.getByLabelText("写作结构资产")).getByText("问题场景 + 工程闭环判断")).toBeInTheDocument();
    expect(screen.getByText("写作结构已拆解，已生成可复用结构资产")).toBeInTheDocument();
  });
});
