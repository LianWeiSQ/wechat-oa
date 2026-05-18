export const UNCATEGORIZED_CATEGORY = "未分类";

export const DEFAULT_ARTICLE_CATEGORIES = [
  "AI Agent",
  "Infra",
  "期货",
  "AI 研究",
  "产品",
  UNCATEGORIZED_CATEGORY,
];

type CategoryInput = {
  title?: string;
  sourceName?: string;
  sourceAccount?: string;
  author?: string;
  contentHtml?: string;
  contentText?: string;
  content?: string;
  tags?: string[];
};

export function normalizeArticleCategory(value?: string): string {
  const category = value?.trim();
  return category && category.length > 0 ? category : UNCATEGORIZED_CATEGORY;
}

export function articleCategory<T extends { category?: string }>(article: T): string {
  return normalizeArticleCategory(article.category);
}

export function suggestArticleCategory(input: CategoryInput): string {
  const text = [
    input.title,
    input.tags?.join(" "),
    input.contentText,
    stripHtml(input.contentHtml ?? input.content ?? ""),
  ]
    .join(" ")
    .toLowerCase();

  if (/(期货|futures?|commodity|cta|量化|交易|套利|合约|持仓|基差|宏观|多空|回测)/i.test(text)) {
    return "期货";
  }
  if (/(agent|智能体|multi-agent|tool use|工具调用|mcp|browser use|工作流|自动执行|autonomous)/i.test(text)) {
    return "AI Agent";
  }
  if (/(llm|gpt|claude|模型|推理|训练|微调|fine-?tune|eval|benchmark|rag|embedding|多模态|论文|research|transformer)/i.test(text)) {
    return "AI 研究";
  }
  if (/(infra|基础设施|架构|工程化|kubernetes|k8s|server|数据库|缓存|队列|部署|运维|监控|observability|latency|吞吐|生产环境)/i.test(text)) {
    return "Infra";
  }
  if (/(产品|用户|增长|商业化|pricing|roadmap|体验|ux|市场|发布|release|竞品)/i.test(text)) {
    return "产品";
  }
  return UNCATEGORIZED_CATEGORY;
}

export function suggestArticleCategoryByAttribution(input: CategoryInput): string {
  return (
    normalizeAttributionCategory(input.author) ??
    normalizeAttributionCategory(input.sourceName) ??
    normalizeAttributionCategory(input.sourceAccount) ??
    suggestArticleCategory(input)
  );
}

function normalizeAttributionCategory(value?: string): string | null {
  const category = value?.replace(/^(作者|来源|公众号)\s*[:：]\s*/, "").trim();
  if (!category || /^(未知|未知来源|未知公众号|微信公众平台)$/i.test(category)) {
    return null;
  }
  return normalizeArticleCategory(category);
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}
