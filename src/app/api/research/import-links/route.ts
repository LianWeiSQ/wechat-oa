import { errorJson, stores } from "@/app/api/_helpers";
import { importUrlArticle } from "@/lib/importers";
import type { Article, ArticleParseRun } from "@/lib/types";

export const runtime = "nodejs";

type FailedResearchImport = {
  url: string;
  reason: string;
};

export async function POST(request: Request) {
  try {
    const { urls, sourceProject, category, tags } = (await request.json().catch(() => ({}))) as {
      urls?: string[] | string;
      sourceProject?: string;
      category?: string;
      tags?: string[];
    };
    const articleUrls = normalizeUrls(urls);
    if (articleUrls.length === 0) {
      return errorJson(new Error("请先粘贴至少一个公众号文章链接"), 422);
    }
    if (articleUrls.length > 80) {
      return errorJson(new Error("单次最多导入 80 篇，建议按公众号/月份分批导入"), 422);
    }

    const { articleStore } = stores();
    const imported: Article[] = [];
    const failed: FailedResearchImport[] = [];
    const parseRuns: ArticleParseRun[] = [];
    const normalizedTags = Array.isArray(tags) ? tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
    const normalizedCategory = String(category ?? "").trim();

    for (const url of articleUrls) {
      const result = await importUrlArticle(articleStore, url, fetch, { sourceProject });
      if (result.ok) {
        let article = result.article;
        if (normalizedCategory || normalizedTags.length > 0) {
          article =
            (await articleStore.updateArticle?.(article.id, {
              category: normalizedCategory || article.category,
              tags: normalizedTags.length > 0 ? Array.from(new Set([...article.tags, ...normalizedTags])) : article.tags,
            })) ?? article;
        }
        imported.push(article);
        parseRuns.push(result.parseRun);
      } else {
        failed.push({ url, reason: result.reason });
        parseRuns.push(result.parseRun);
      }
    }

    return Response.json({
      imported,
      failed,
      parseRuns,
      summary: {
        total: articleUrls.length,
        imported: imported.length,
        failed: failed.length,
      },
    });
  } catch (error) {
    return errorJson(error);
  }
}

function normalizeUrls(input: string[] | string | undefined): string[] {
  const values = Array.isArray(input) ? input : String(input ?? "").split(/\r?\n|,|，/);
  return Array.from(
    new Set(
      values
        .map((url) => String(url).trim())
        .filter(Boolean)
        .filter((url) => /^https?:\/\//i.test(url)),
    ),
  );
}
