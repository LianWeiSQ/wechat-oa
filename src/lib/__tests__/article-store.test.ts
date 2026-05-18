import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createArticleStore } from "@/lib/articles";
import { openDatabase } from "@/lib/db";
import { importManualArticle, importUrlArticle } from "@/lib/importers";

let tempDir: string;
let store: ReturnType<typeof createArticleStore>;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "wechat-oa-"));
  store = createArticleStore(openDatabase(join(tempDir, "test.sqlite")));
});

afterEach(() => {
  store.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("article importing", () => {
  it("imports a manual article and persists metadata, tags, and content", () => {
    const article = importManualArticle(store, {
      title: "GPT-5.5 工程化路线拆解",
      sourceName: "AI Infra Notes",
      originalUrl: "https://example.com/manual-1",
      author: "William",
      publishedAt: "2026-05-10",
      contentText: "这是一篇关于模型路由、评测、成本控制的长文。",
      tags: ["模型路由", "评测"],
    });

    expect(article.id).toMatch(/^art_/);
    expect(article.sourceType).toBe("web");
    expect(article.sourceName).toBe("AI Infra Notes");
    expect(article.category).toBe("AI 研究");
    expect(article.isFavorite).toBe(false);
    expect(article.tags).toEqual(["模型路由", "评测"]);
    expect(store.getArticle(article.id)?.contentText).toContain("模型路由");
  });

  it("returns the existing article when the same original URL is imported twice", () => {
    const first = importManualArticle(store, {
      title: "第一次标题",
      sourceName: "AI Account",
      originalUrl: "https://mp.weixin.qq.com/s/duplicate",
      contentText: "first",
      tags: [],
    });
    const second = importManualArticle(store, {
      title: "第二次标题",
      sourceName: "AI Account",
      originalUrl: "https://mp.weixin.qq.com/s/duplicate",
      contentText: "second",
      tags: [],
    });

    expect(second.id).toBe(first.id);
    expect(store.listArticles()).toHaveLength(1);
    expect(store.getArticle(first.id)?.title).toBe("第一次标题");
  });

  it("refreshes an existing URL article when the link is parsed again", async () => {
    const existing = importManualArticle(store, {
      title: "旧标题",
      sourceName: "AI Account",
      originalUrl: "https://mp.weixin.qq.com/s/refresh",
      contentText: "旧正文",
      tags: [],
    });

    const result = await importUrlArticle(store, "https://mp.weixin.qq.com/s/refresh", async () => ({
      ok: true,
      status: 200,
      text: async () => `
        <html><head><meta property="og:title" content="新标题" /></head>
        <body>
          <script>var nickname = "AI Account";</script>
          <div id="js_content">
            <p>这次重新解析拿到了完整正文。</p>
            <p>后续段落应该覆盖旧的截断内容。</p>
          </div>
          <script>var end = true;</script>
        </body></html>
      `,
    }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.article.id).toBe(existing.id);
      expect(result.article.title).toBe("新标题");
      expect(result.article.category).toBe("AI Account");
      expect(result.article.contentText).toContain("完整正文");
      expect(result.article.contentText).not.toContain("旧正文");
    }
    expect(store.listArticles()).toHaveLength(1);
  });

  it("returns an editable fallback when URL parsing cannot extract article content", async () => {
    const result = await importUrlArticle(store, "https://mp.weixin.qq.com/s/blocked", async () => ({
      ok: false,
      status: 403,
      text: async () => "blocked",
    }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fallback.originalUrl).toBe("https://mp.weixin.qq.com/s/blocked");
      expect(result.fallback.contentText).toBe("");
      expect(result.reason).toContain("无法解析");
    }
    expect(store.listArticles()).toHaveLength(0);
  });

  it("imports a generic technical webpage and records parse quality", async () => {
    const result = await importUrlArticle(store, "https://example.com/agent-engineering", async () => ({
      ok: true,
      status: 200,
      text: async () => `
        <html>
          <head>
            <title>Agent Engineering in Production</title>
            <meta name="author" content="Alex Chen" />
            <meta property="og:site_name" content="Engineering Blog" />
          </head>
          <body>
            <article>
              <p>Agent systems need permissions, observability, rollback, and cost controls.</p>
              <p>Production teams should measure tool latency, audit trails, and failure recovery.</p>
            </article>
          </body>
        </html>
      `,
    }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.article.sourceType).toBe("web");
      expect(result.article.sourceName).toBe("Engineering Blog");
      expect(result.article.category).toBe("Alex Chen");
      expect(result.article.contentText).toContain("observability");
      expect(result.parseRun.status).toBe("parsed");
      expect(result.parseRun.strategy).toBe("generic-web");
      expect(result.parseRun.qualityScore).toBeGreaterThan(50);
    }
  });

  it("keeps images from Next.js optimized article pages", async () => {
    const result = await importUrlArticle(store, "https://www.anthropic.com/engineering/harness-design", async () => ({
      ok: true,
      status: 200,
      text: async () => `
        <html>
          <head>
            <title>Harness design</title>
            <meta property="og:site_name" content="Anthropic" />
          </head>
          <body>
            <article>
              <div class="ArticleShell" role="region" tabindex="0">
              <p style="color:red">Long running agents need a planner, generator, evaluator, and careful browser QA.</p>
              <p><br /></p>
              <button><span>Game play</span></button>
              <figure class="MediaCard">
              <img
                src="/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fdiagram.png&amp;w=3840&amp;q=75"
                srcSet="/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fdiagram.png&amp;w=2048&amp;q=75 1x, /_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fdiagram.png&amp;w=3840&amp;q=75 2x"
                alt="Harness diagram"
              />
              <figcaption class="caption">Harness design diagram</figcaption>
              </figure>
              <table class="Comparison"><tbody><tr><th>Mode</th><td>Long running</td></tr></tbody></table>
              <p>Images should stay attached to the imported article.</p>
              </div>
            </article>
          </body>
        </html>
      `,
    }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.article.contentHtml).toContain(
        'src="https://www-cdn.anthropic.com/images/4zrzovbb/website/diagram.png"',
      );
      expect(result.article.contentHtml).toContain('alt="Harness diagram"');
      expect(result.article.contentHtml).toContain("<figcaption>Harness design diagram</figcaption>");
      expect(result.article.contentHtml).toContain("<table>");
      expect(result.article.contentHtml).toContain("Long running</td>");
      expect(result.article.contentHtml).not.toContain("Game play");
      expect(result.article.contentHtml).not.toContain("class=");
      expect(result.article.contentHtml).not.toContain("style=");
      expect(result.article.contentHtml).not.toContain("<p><br /></p>");
      expect(result.article.contentHtml).not.toContain("/_next/image");
      expect(result.article.contentHtml.match(/<img\b/g)).toHaveLength(1);
    }
  });

  it("imports a WeChat page with the dedicated parser strategy", async () => {
    const result = await importUrlArticle(store, "https://mp.weixin.qq.com/s/agent", async () => ({
      ok: true,
      status: 200,
      text: async () => `
        <html><head><meta property="og:title" content="Agent 成本治理" /></head>
        <body>
          <script>var nickname = "AI Systems"; var author = "Lin"; var ct = "1778352000";</script>
          <div id="js_content">
            <p>充中 发自 凹非寺</p>
            <p>量子位 | 公众号 QbitAI</p>
            <p>Agent 成本治理需要工具权限、缓存和评测。</p>
            <p>这套系统还需要覆盖日志、回滚、评估、缓存、权限、成本、队列和异常恢复。</p>
            <p>这些工程细节决定了 Agent 能不能稳定上线。</p>
            <p><img data-src="https://mmbiz.qpic.cn/mmbiz_png/demo/0?wx_fmt=png&amp;tp=webp" alt="成本架构图" /></p>
            <p>一键三连「点赞」「转发」「小心心」</p>
            <p>欢迎在评论区留下你的想法！</p>
          </div>
          <script>var end = true;</script>
        </body></html>
      `,
    }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.article.sourceType).toBe("wechat");
      expect(result.article.sourceName).toBe("AI Systems");
      expect(result.article.category).toBe("Lin");
      expect(result.article.contentText).not.toContain("发自");
      expect(result.article.contentText).not.toContain("公众号 QbitAI");
      expect(result.article.contentText).not.toContain("一键三连");
      expect(result.article.contentText).not.toContain("评论区");
      expect(result.article.contentHtml).toContain(
        'src="https://mmbiz.qpic.cn/mmbiz_png/demo/0?wx_fmt=png&amp;tp=webp"',
      );
      expect(result.article.contentHtml).toContain('alt="成本架构图"');
      expect(result.article.contentHtml).not.toContain("data-src");
      expect(result.parseRun.strategy).toBe("wechat");
    }
  });

  it("does not crop valid article content when code contains cleaned_end", async () => {
    const result = await importUrlArticle(store, "https://mp.weixin.qq.com/s/dataflow", async () => ({
      ok: true,
      status: 200,
      text: async () => `
        <html><head><meta property="og:title" content="从 PDF 到微调数据" /></head>
        <body>
          <script>var nickname = "PaperAgent"; var author = "PaperAgent"; var ct = "1778352000";</script>
          <div id="js_content">
            <p>作者 发自 凹非寺</p>
            <p>这篇文章讨论 DataFlow、LlamaFactory 和 DataFlex 如何组合使用。</p>
            <p>第一步：文本切分。长文本被按照指定策略切成多个 chunk。</p>
            <p>第二步：知识清洗。LLM 返回的结果会用特定标签（<code>&lt;cleaned_start&gt;</code> / <code>&lt;cleaned_end&gt;</code>）包裹。</p>
            <p>第三步：QA 生成。基于清洗后的文本，LLM 生成结构化的多跳问答对。</p>
            <p>第四步：格式化输出。将 QA 数据转为 LlamaFactory 可直接使用的 Alpaca 格式。</p>
            <p>小结：各个环节能单独拆出来用，也能拼在一起跑。</p>
            <p>——好文推荐——</p>
            <p>推荐文章标题不应该进入正文。</p>
          </div>
          <script>var end = true;</script>
        </body></html>
      `,
    }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.article.contentText).toContain("第三步：QA 生成");
      expect(result.article.category).toBe("PaperAgent");
      expect(result.article.contentText).toContain("第四步：格式化输出");
      expect(result.article.contentText).toContain("小结：各个环节能单独拆出来用");
      expect(result.article.contentText).not.toContain("推荐文章标题不应该进入正文");
    }
  });

  it("updates article content so users can manually clean imported articles", () => {
    const article = importManualArticle(store, {
      title: "待编辑文章",
      sourceName: "AI Account",
      contentHtml: "<p>旧正文</p>",
      category: "未分类",
    });

    const updated = store.updateArticle(article.id, {
      title: "已编辑文章",
      contentHtml: "<p>干净正文</p>",
      category: "Infra",
    });

    expect(updated?.title).toBe("已编辑文章");
    expect(updated?.contentHtml).toBe("<p>干净正文</p>");
    expect(updated?.contentText).toBe("干净正文");
    expect(updated?.category).toBe("Infra");
  });

  it("persists article favorite status for knowledge management", () => {
    const article = importManualArticle(store, {
      title: "值得反复读的文章",
      sourceName: "AI Account",
      contentText: "这篇文章需要后续重点回看。",
    });

    expect(article.isFavorite).toBe(false);

    const updated = store.updateArticle(article.id, { isFavorite: true });

    expect(updated?.isFavorite).toBe(true);
    expect(store.getArticle(article.id)?.isFavorite).toBe(true);
  });

  it("deletes articles from the local library", () => {
    const article = importManualArticle(store, {
      title: "待删除文章",
      sourceName: "AI Account",
      contentText: "这篇文章会被删除",
    });

    expect(store.deleteArticle(article.id)).toBe(true);
    expect(store.getArticle(article.id)).toBeNull();
    expect(store.deleteArticle(article.id)).toBe(false);
  });
});
