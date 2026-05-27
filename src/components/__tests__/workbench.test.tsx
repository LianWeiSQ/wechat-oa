import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Workbench } from "@/components/workbench";
import { ANALYSIS_TEMPLATES } from "@/lib/analysis";
import { THEME_COOKIE_NAME, THEME_STORAGE_KEY } from "@/lib/theme";
import type { Article, LocalDraft } from "@/lib/types";

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

const wechatDraft: LocalDraft = {
  id: "draft_wechat",
  title: "OpenAI大神教你如何榨干Codex",
  body: "<h1>OpenAI大神教你如何榨干Codex</h1><p>真正的差距不在会不会打开 Codex，而在你能不能把它变成稳定的工程工作流。</p>",
  sourceAnalysisIds: [],
  sourceArticleIds: ["art_agent"],
  contentChannel: "wechat",
  publishStatus: "draft",
  plannedPublishAt: "",
  publishedAt: "",
  queueOrder: 0,
  notes: "首篇公众号定调稿",
  exportFormat: "html",
  wechatDraftStatus: "not_sent",
  createdAt: "2026-05-20T08:00:00.000Z",
  updatedAt: "2026-05-20T08:00:00.000Z",
};

const queuedWechatDraft: LocalDraft = {
  ...wechatDraft,
  id: "draft_wechat_queued",
  title: "Codex 工作流排期稿",
  body: "<p>排期稿正文。</p>",
  publishStatus: "queued",
  plannedPublishAt: "2026-05-29T01:30:00.000Z",
  queueOrder: 1,
  notes: "",
};

const publishedWechatDraft: LocalDraft = {
  ...wechatDraft,
  id: "draft_wechat_published",
  title: "已经发布的公众号稿",
  body: "<p>这篇已经发出，不应该留在待提交工作台。</p>",
  publishStatus: "published",
  publishedAt: "2026-05-21T08:00:00.000Z",
  queueOrder: 3,
};

const xiaohongshuDraft: LocalDraft = {
  ...wechatDraft,
  id: "draft_xhs",
  title: "小红书独立笔记",
  body: "<p>这篇属于小红书，不应该出现在微信公众号工作台。</p>",
  contentChannel: "xiaohongshu",
  publishStatus: "draft",
  queueOrder: 1,
};

async function openReaderActions() {
  await userEvent.click(screen.getByRole("button", { name: "素材操作" }));
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

    expect(screen.getByRole("button", { name: "素材库" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "公众号草稿" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "小红书草稿" })).toBeInTheDocument();
    expect(screen.getByText("2 篇外部引用素材 · 0 篇本地创作文章")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "素材操作" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "管理引用素材" })).not.toBeInTheDocument();
    await openReaderActions();
    expect(screen.getByRole("button", { name: "管理引用素材" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑素材正文" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 拆解" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增引用素材" })).toBeInTheDocument();
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

    await clickReaderAction("新增引用素材");
    const importDialog = screen.getByRole("dialog", { name: "新增引用素材" });
    expect(within(importDialog).getByRole("button", { name: "链接导入" })).toBeInTheDocument();
    expect(within(importDialog).getByRole("button", { name: "手动粘贴" })).toBeInTheDocument();
    await userEvent.click(within(importDialog).getByRole("button", { name: "关闭" }));

    await openReaderFilters();
    await userEvent.selectOptions(screen.getByLabelText("分类"), "AI 研究");

    expect(screen.queryByText("Agent 工程化成本拆解")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "RAG 评测体系" })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("分类"), "全部");
    await userEvent.type(screen.getByPlaceholderText("搜索素材标题、来源、标签、正文"), "RAG");

    expect(screen.queryByText("Agent 工程化成本拆解")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "RAG 评测体系" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "清除检索条件" }));
    await userEvent.type(screen.getByPlaceholderText("搜索素材标题、来源、标签、正文"), "事实性");
    expect(screen.queryByText("Agent 工程化成本拆解")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "RAG 评测体系" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "打开引用素材：RAG 评测体系" }));
    expect(screen.getByRole("heading", { name: "RAG 评测体系" })).toBeInTheDocument();
    expect(within(screen.getByRole("article")).queryByText("来源：LLM Lab")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "运行高级处理" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "公众号草稿" }));

    expect(screen.getByRole("heading", { name: "公众号草稿" })).toBeInTheDocument();
    expect(screen.getByLabelText("微信公众号待提交草稿工作台")).toBeInTheDocument();
    expect(screen.getByText("没有待提交草稿")).toBeInTheDocument();
    expect(screen.getByText(/这里只显示待提交草稿/)).toBeInTheDocument();
    expect(screen.queryByText("当前引用素材")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /生成专业长文/ })).not.toBeInTheDocument();
    expect(screen.queryByText("图片模型配置")).not.toBeInTheDocument();
    expect(screen.queryByText("微信后台")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新增引用素材" })).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByText("Agent 成本来自工具调用和上下文膨胀。")).not.toBeInTheDocument();
  });

  it("collapses and restores the article rail as part of the page layout", async () => {
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
    await userEvent.click(screen.getByRole("button", { name: "收起素材栏" }));

    expect(screen.queryByText("显示 2 / 2 篇")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开素材栏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开素材列表" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "展开素材列表" }));
    expect(screen.queryByRole("dialog", { name: "素材列表" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索素材标题、来源、标签、正文")).toBeInTheDocument();
    expect(screen.getByText("显示 2 / 2 篇")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "打开引用素材：RAG 评测体系" }));

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

    await clickReaderAction("特别收藏当前素材");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/articles/art_agent",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"isFavorite":true'),
      }),
    );
    expect(await screen.findByText("已加入特别收藏：Agent 工程化成本拆解")).toBeInTheDocument();
    await openReaderActions();
    expect(screen.getByRole("button", { name: "取消特别收藏当前素材" })).toBeInTheDocument();

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

    await clickReaderAction("编辑素材正文");
    const dialog = screen.getByRole("dialog", { name: "编辑素材正文" });
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

    await clickReaderAction("编辑素材正文");
    const dialog = screen.getByRole("dialog", { name: "编辑素材正文" });
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

    await clickReaderAction("管理引用素材");
    const dialog = screen.getByRole("dialog", { name: "引用素材管理" });
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
    expect(await screen.findByText("已更新引用信息：期货")).toBeInTheDocument();
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

    await clickReaderAction("管理引用素材");
    const dialog = screen.getByRole("dialog", { name: "引用素材管理" });
    const row = within(dialog).getByText("Agent 工程化成本拆解").closest("form");
    expect(row).not.toBeNull();

    await userEvent.click(within(row as HTMLFormElement).getByRole("button", { name: "删除" }));
    expect(screen.getByText("再次点击确认删除：Agent 工程化成本拆解")).toBeInTheDocument();
    await userEvent.click(within(row as HTMLFormElement).getByRole("button", { name: "确认删除" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/library/articles/art_agent", { method: "DELETE" });
    expect(await screen.findByText("已删除引用素材：Agent 工程化成本拆解")).toBeInTheDocument();
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

    await clickReaderAction("新增引用素材");
    const importDialog = screen.getByRole("dialog", { name: "新增引用素材" });
    await userEvent.click(within(importDialog).getByRole("button", { name: "手动粘贴" }));
    await userEvent.type(screen.getByPlaceholderText("标题"), "上下文工程实践");
    await userEvent.type(screen.getByPlaceholderText("来源名称"), "Local Notes");
    await userEvent.type(screen.getByPlaceholderText("原文链接"), "local://context-engineering");
    await userEvent.type(screen.getByPlaceholderText("正文"), "上下文工程需要把需求、工具和验证组合成稳定流程。");
    await userEvent.click(screen.getByRole("button", { name: "保存到引用素材库" }));

    expect(await screen.findByRole("heading", { name: "上下文工程实践" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "新增引用素材" })).not.toBeInTheDocument();
    expect(screen.getByText("已保存到引用素材库：上下文工程实践")).toBeInTheDocument();
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

    await clickReaderAction("新增引用素材");
    await userEvent.type(screen.getByPlaceholderText("粘贴外部文章链接后解析"), importedArticle.originalUrl);
    await userEvent.click(screen.getByRole("button", { name: "链接解析" }));

    expect(await screen.findByRole("heading", { name: "Hugging Face 评估指南" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "新增引用素材" })).not.toBeInTheDocument();
    expect(screen.getByText("已保存到引用素材库：Hugging Face 评估指南")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "素材操作" }));
    fireEvent.click(screen.getByRole("button", { name: "新增引用素材" }));
    fireEvent.change(screen.getByPlaceholderText("粘贴外部文章链接后解析"), {
      target: { value: importedArticle.originalUrl },
    });
    fireEvent.click(screen.getByRole("button", { name: "链接解析" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole("dialog", { name: "新增引用素材" })).not.toBeInTheDocument();
    expect(screen.getByText("已保存到引用素材库：短提示测试")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(screen.queryByText("已保存到引用素材库：短提示测试")).not.toBeInTheDocument();
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

    await clickReaderAction("新增引用素材");
    await userEvent.type(screen.getByPlaceholderText("粘贴外部文章链接后解析"), "https://example.com/blocked");
    await userEvent.click(screen.getByRole("button", { name: "链接解析" }));

    const importDialog = screen.getByRole("dialog", { name: "新增引用素材" });
    expect(await within(importDialog).findByText("无法解析文章正文，请改用手动粘贴")).toBeInTheDocument();
    expect(within(importDialog).getByRole("button", { name: "手动粘贴" })).toBeInTheDocument();
  });

  it("shows only pending WeChat drafts and saves body edits from the workbench", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body ?? "{}")) as Partial<LocalDraft>;
      const draftId = url.split("/").pop();
      const baseDraft = [wechatDraft, queuedWechatDraft, publishedWechatDraft, xiaohongshuDraft].find((draft) => draft.id === draftId) ?? wechatDraft;
      return {
        ok: true,
        json: vi.fn().mockResolvedValue({
          draft: {
            ...baseDraft,
            ...payload,
            updatedAt: "2026-05-27T09:00:00.000Z",
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Workbench
        initialArticles={articles}
        initialDrafts={[publishedWechatDraft, xiaohongshuDraft, queuedWechatDraft, wechatDraft]}
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

    await userEvent.click(screen.getByRole("button", { name: "公众号草稿" }));
    const draftList = screen.getByLabelText("待提交草稿文件");

    expect(within(draftList).getByText(queuedWechatDraft.title)).toBeInTheDocument();
    expect(within(draftList).getByText(wechatDraft.title)).toBeInTheDocument();
    expect(within(draftList).getByLabelText("发布顺序 1")).toBeInTheDocument();
    expect(within(draftList).getByLabelText("发布顺序 2")).toBeInTheDocument();
    expect(within(draftList).queryByText("0")).not.toBeInTheDocument();
    expect(within(draftList).queryByText(publishedWechatDraft.title)).not.toBeInTheDocument();
    expect(within(draftList).queryByText(xiaohongshuDraft.title)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成微信公众号原创稿" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("写作蓝图预览")).not.toBeInTheDocument();

    await userEvent.click(within(draftList).getByText(wechatDraft.title));
    expect(screen.getByDisplayValue(wechatDraft.title)).toBeInTheDocument();
    expect(screen.getAllByText("真正的差距不在会不会打开 Codex，而在你能不能把它变成稳定的工程工作流。").length).toBeGreaterThan(0);

    await userEvent.clear(screen.getByLabelText("标题"));
    await userEvent.type(screen.getByLabelText("标题"), "OpenAI大神教你如何榨干Codex：首篇改稿");
    await userEvent.clear(screen.getByLabelText("正文"));
    await userEvent.type(screen.getByLabelText("正文"), "<p>更适合首篇文章的新开头，正文可以在工作台直接改。</p>");
    await userEvent.selectOptions(screen.getByLabelText("状态"), "queued");
    fireEvent.change(screen.getByLabelText("计划发布时间"), { target: { value: "2026-06-01T09:30" } });
    await userEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    const [, saveInit] = fetchMock.mock.calls.find(([url]) => url === "/api/content/drafts/draft_wechat") ?? [];
    const saveBody = JSON.parse(String((saveInit as RequestInit).body)) as Partial<LocalDraft>;
    expect(saveBody).toMatchObject({
      title: "OpenAI大神教你如何榨干Codex：首篇改稿",
      body: "<p>更适合首篇文章的新开头，正文可以在工作台直接改。</p>",
      publishStatus: "queued",
      plannedPublishAt: "2026-06-01T09:30",
    });
    expect(await screen.findByText("草稿正文已保存")).toBeInTheDocument();
    expect(screen.getAllByText("更适合首篇文章的新开头，正文可以在工作台直接改。").length).toBeGreaterThan(0);
  });

  it("removes a WeChat draft from the pending list after marking it published", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body ?? "{}")) as Partial<LocalDraft>;
      const draftId = url.split("/").pop();
      const baseDraft = [wechatDraft, queuedWechatDraft].find((draft) => draft.id === draftId) ?? wechatDraft;
      return {
        ok: true,
        json: vi.fn().mockResolvedValue({
          draft: {
            ...baseDraft,
            ...payload,
            updatedAt: "2026-05-27T09:30:00.000Z",
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Workbench
        initialArticles={articles}
        initialDrafts={[queuedWechatDraft, wechatDraft]}
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

    await userEvent.click(screen.getByRole("button", { name: "公众号草稿" }));
    const draftList = screen.getByLabelText("待提交草稿文件");
    await userEvent.click(within(draftList).getByText(wechatDraft.title));
    await userEvent.click(screen.getByRole("button", { name: "标为已发布" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/content/drafts/draft_wechat",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"publishStatus":"published"'),
      }),
    );
    expect(await screen.findByText(`已标记发布：${wechatDraft.title}`)).toBeInTheDocument();
    expect(within(draftList).queryByText(wechatDraft.title)).not.toBeInTheDocument();
    expect(within(draftList).getByText(queuedWechatDraft.title)).toBeInTheDocument();
  });
});
