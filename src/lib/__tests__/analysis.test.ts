import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANALYSIS_TEMPLATES,
  analyzeArticle,
  callOpenAICompatible,
  createDraftContextAnalysisRun,
  createModelRequest,
  parseModelResponse,
} from "@/lib/analysis";
import type { Article, AiSettings } from "@/lib/types";

const article: Article = {
  id: "art_1",
  title: "AI Agent 成本失控的五个工程原因",
  sourceType: "wechat",
  sourceName: "AI Systems",
  sourceAccount: "AI Systems",
  originalUrl: "https://mp.weixin.qq.com/s/agent-cost",
  author: "Lin",
  publishedAt: "2026-05-09",
  contentHtml: "<p>Agent 在工具调用、上下文膨胀、评测缺失、缓存不足时会放大成本。</p>",
  contentText: "Agent 在工具调用、上下文膨胀、评测缺失、缓存不足时会放大成本。",
  content: "Agent 在工具调用、上下文膨胀、评测缺失、缓存不足时会放大成本。",
  category: "AI Agent",
  isFavorite: false,
  tags: ["agent", "成本"],
  createdAt: "2026-05-14T00:00:00.000Z",
  updatedAt: "2026-05-14T00:00:00.000Z",
};

const settings: AiSettings = {
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-test",
  model: "gpt-test",
};

describe("AI article analysis", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires an API key before calling the model", async () => {
    await expect(
      analyzeArticle(article, ANALYSIS_TEMPLATES[0], { ...settings, apiKey: "" }, async () => {
        throw new Error("should not call");
      }),
    ).rejects.toThrow("请先配置 OpenAI-compatible API Key");
  });

  it("parses structured model output with score reasons and topic candidates", async () => {
    const run = await analyzeArticle(article, ANALYSIS_TEMPLATES[0], settings, async (request) => {
      expect(request.model).toBe("gpt-test");
      expect(request.messages[1].content).toContain("AI Agent 成本失控");
      return {
        summary: "文章指出 Agent 成本失控来自工具调用、上下文和评测缺失。",
        technicalInsights: ["缓存层能显著降低重复推理成本", "需要按任务类型拆分模型路由"],
        risks: ["忽视评测会导致上线后成本不可控"],
        reusableAngles: ["为什么你的 Agent Demo 很便宜，上线后却很贵"],
        viralScore: {
          total: 86,
          dimensions: {
            pain: 23,
            novelty: 21,
            evidence: 20,
            debate: 22,
          },
          reasons: ["成本焦虑明确", "技术细节足够硬"],
        },
        topicCandidates: [
          {
            title: "Agent 上线后变贵，不是模型的问题",
            hook: "很多团队低估的是工具调用链，而不是 token 单价。",
            targetReader: "AI 工程负责人",
            angle: "工程成本控制",
            viralScore: 88,
          },
        ],
      };
    });

    expect(run.viralScore.total).toBe(86);
    expect(run.viralScore.reasons).toContain("成本焦虑明确");
    expect(run.topicCandidates[0].title).toContain("Agent");
  });

  it("normalizes richer Codex object fields into the expected analysis shape", () => {
    const parsed = parseModelResponse({
      summary: "Agent 成本需要从系统工程视角治理。",
      technicalInsights: [
        { title: "工具调用放大成本", detail: "一次用户请求可能触发多轮工具链。" },
        { finding: "上下文膨胀", implication: "需要压缩记忆和检索上下文。" },
      ],
      risks: [{ risk: "无评测上线", impact: "成本和质量不可控" }],
      reusableAngles: [{ title: "Agent 成本不是 token 单价问题", hook: "真正贵的是链路失控。" }],
      viralScore: {
        total: 84,
        dimensions: {
          pain: { score: 88, reason: "成本痛点明确" },
          novelty: { score: 20, reason: "角度不算全新但足够具体" },
          evidence: { score: 21, reason: "工程证据充分" },
          debate: { score: 21, reason: "容易引发路线讨论" },
        },
        reasons: ["痛点明确"],
      },
      topicCandidates: [
        {
          title: "Agent 上线变贵，是工程问题",
          hook: "Demo 便宜不代表生产便宜。",
          targetReader: "AI 工程负责人",
          angle: "成本治理",
          viralScore: { total: 87, reasons: ["反常识"] },
        },
        {
          title: "没有评测的 Agent 最危险",
          hook: "上线前看不到成本，上线后才会暴露。",
          targetReader: "技术管理者",
          angle: "评测治理",
          viralScore: { dimensions: { pain: 20, novelty: 18, evidence: 21, debate: 19 } },
        },
      ],
    });

    expect(parsed.technicalInsights[0]).toContain("工具调用放大成本");
    expect(parsed.risks[0]).toContain("无评测上线");
    expect(parsed.reusableAngles[0]).toContain("Agent 成本不是 token 单价问题");
    expect(parsed.viralScore.dimensions.pain).toBe(22);
    expect(parsed.topicCandidates[0].viralScore).toBe(87);
    expect(parsed.topicCandidates[1].viralScore).toBe(78);
  });

  it("creates a lightweight draft context when users skip manual AI analysis", () => {
    const run = createDraftContextAnalysisRun(article);

    expect(run.articleId).toBe(article.id);
    expect(run.templateId).toBe("auto-draft-context");
    expect(run.summary).toContain(article.title);
    expect(run.technicalInsights.join(" ")).toContain("专业长文");
    expect(run.topicCandidates[0].evidenceArticleIds).toEqual([article.id]);
  });

  it("calls the Responses API wire format with reasoning and storage disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  summary: "ok",
                  technicalInsights: [],
                  risks: [],
                  reusableAngles: [],
                  viralScore: {
                    total: 50,
                    dimensions: { pain: 12, novelty: 12, evidence: 13, debate: 13 },
                    reasons: ["联通"],
                  },
                  topicCandidates: [],
                }),
              },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const raw = await callOpenAICompatible(createModelRequest(article, ANALYSIS_TEMPLATES[0], "gpt-5.4"), {
      ...settings,
      modelProvider: "OpenAI",
      baseUrl: "http://127.0.0.1:3000",
      model: "gpt-5.4",
      wireApi: "responses",
      reasoningEffort: "xhigh",
      disableResponseStorage: true,
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:3000/responses");
    expect(body.model).toBe("gpt-5.4");
    expect(body.reasoning).toEqual({ effort: "high" });
    expect(body.store).toBe(false);
    expect(body.text.format).toEqual({ type: "json_object" });
    expect(parseModelResponse(raw).summary).toBe("ok");
  });
});
