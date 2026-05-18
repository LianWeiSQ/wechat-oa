import type { DatabaseSync } from "node:sqlite";
import { normalizeArticleCategory, suggestArticleCategory } from "@/lib/article-categories";
import { createId, nowIso } from "@/lib/ids";
import type { AnalysisRun, Article, ArticleInput, ArticleParseRun, ArticleSourceType, TopicCandidate } from "@/lib/types";

type ArticleRow = {
  id: string;
  title: string;
  source_type: ArticleSourceType;
  source_name: string;
  source_account: string;
  original_url: string;
  author: string;
  published_at: string;
  content_html: string;
  content_text: string;
  content: string;
  category: string;
  is_favorite: number;
  tags_json: string;
  created_at: string;
  updated_at: string;
};

type AnalysisRunRow = {
  id: string;
  article_id: string;
  template_id: string;
  template_name: string;
  lens: string;
  summary: string;
  technical_insights_json: string;
  risks_json: string;
  reusable_angles_json: string;
  viral_score_json: string;
  topic_candidates_json: string;
  model_metadata_json: string;
  created_at: string;
};

type TopicCandidateRow = {
  id: string;
  analysis_run_id: string;
  title: string;
  hook: string;
  target_reader: string;
  angle: string;
  evidence_article_ids_json: string;
  viral_score: number;
  status: TopicCandidate["status"];
  created_at: string;
  updated_at: string;
};

type ArticleParseRunRow = {
  id: string;
  article_id?: string;
  url: string;
  status: ArticleParseRun["status"];
  strategy: ArticleParseRun["strategy"];
  quality_score: number;
  metadata_json: string;
  fallback_reason: string;
  created_at: string;
};

export function createArticleStore(db: DatabaseSync) {
  return {
    close() {
      db.close();
    },

    createArticle(input: ArticleInput): Article {
      const originalUrl = normalizeOriginalUrl(input.originalUrl);
      const existing = this.getArticleByUrl(originalUrl);
      if (existing) {
        return existing;
      }

      const timestamp = nowIso();
      const sourceType = normalizeSourceType(input.sourceType, originalUrl);
      const sourceName = normalizeRequiredText(input.sourceName ?? input.sourceAccount, "未知来源");
      const contentHtml = normalizeContentHtml(input);
      const contentText = normalizeContentText(input, contentHtml);
      const category = input.category?.trim()
        ? normalizeArticleCategory(input.category)
        : suggestArticleCategory({ ...input, contentHtml, contentText });
      const article: Article = {
        id: createId("art"),
        title: input.title.trim(),
        sourceType,
        sourceName,
        sourceAccount: sourceName,
        originalUrl,
        author: input.author?.trim() ?? "",
        publishedAt: input.publishedAt?.trim() ?? "",
        contentHtml,
        contentText,
        content: contentHtml || contentText,
        category,
        isFavorite: Boolean(input.isFavorite),
        tags: normalizeTags(input.tags ?? []),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      db.prepare(`
        INSERT INTO articles (
          id, title, source_type, source_name, source_account, original_url, author, published_at,
          content_html, content_text, content, category, is_favorite, tags_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        article.id,
        article.title,
        article.sourceType,
        article.sourceName,
        article.sourceAccount,
        article.originalUrl,
        article.author,
        article.publishedAt,
        article.contentHtml,
        article.contentText,
        article.content,
        article.category,
        article.isFavorite ? 1 : 0,
        JSON.stringify(article.tags),
        article.createdAt,
        article.updatedAt,
      );

      return article;
    },

    getArticle(id: string): Article | null {
      const row = db.prepare("SELECT * FROM articles WHERE id = ?").get(id) as ArticleRow | undefined;
      return row ? mapArticle(row) : null;
    },

    getArticleByUrl(originalUrl: string): Article | null {
      const row = db
        .prepare("SELECT * FROM articles WHERE original_url = ?")
        .get(normalizeOriginalUrl(originalUrl)) as ArticleRow | undefined;
      return row ? mapArticle(row) : null;
    },

    updateArticle(id: string, input: Partial<ArticleInput>): Article | null {
      const existing = this.getArticle(id);
      if (!existing) {
        return null;
      }

      const title = normalizeRequiredText(input.title ?? existing.title, existing.title);
      const originalUrl = input.originalUrl === undefined ? existing.originalUrl : normalizeOriginalUrl(input.originalUrl);
      const sourceType = normalizeSourceType(input.sourceType ?? existing.sourceType, originalUrl);
      const sourceName = normalizeRequiredText(input.sourceName ?? input.sourceAccount ?? existing.sourceName, existing.sourceName);
      const contentHtml = (input.contentHtml ?? input.content ?? input.contentText ?? existing.contentHtml).trim();
      const contentText = (input.contentText ?? stripHtml(contentHtml)).trim();
      const category = input.category === undefined ? existing.category : normalizeArticleCategory(input.category);
      const isFavorite = input.isFavorite ?? existing.isFavorite;
      const tags = input.tags === undefined ? existing.tags : normalizeTags(input.tags);
      const updatedAt = nowIso();

      db.prepare(`
        UPDATE articles
        SET title = ?, source_type = ?, source_name = ?, source_account = ?, original_url = ?,
            author = ?, published_at = ?, content_html = ?, content_text = ?, content = ?,
            category = ?, is_favorite = ?, tags_json = ?, updated_at = ?
        WHERE id = ?
      `).run(
        title,
        sourceType,
        sourceName,
        sourceName,
        originalUrl,
        input.author ?? existing.author,
        input.publishedAt ?? existing.publishedAt,
        contentHtml,
        contentText,
        contentHtml || contentText,
        category,
        isFavorite ? 1 : 0,
        JSON.stringify(tags),
        updatedAt,
        id,
      );

      return this.getArticle(id);
    },

    deleteArticle(id: string): boolean {
      const result = db.prepare("DELETE FROM articles WHERE id = ?").run(id);
      return Number(result.changes) > 0;
    },

    listArticles(query = ""): Article[] {
      const rows = db
        .prepare("SELECT * FROM articles ORDER BY updated_at DESC")
        .all() as ArticleRow[];
      const needle = query.trim().toLowerCase();
      const articles = rows.map(mapArticle);
      if (!needle) {
        return articles;
      }
      return articles.filter((article) =>
        [article.title, article.sourceAccount, article.author, article.category, article.tags.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );
    },

    saveAnalysisRun(run: AnalysisRun): AnalysisRun {
      db.prepare(`
        INSERT INTO analysis_runs (
          id, article_id, template_id, template_name, lens, summary,
          technical_insights_json, risks_json, reusable_angles_json,
          viral_score_json, topic_candidates_json, model_metadata_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        run.id,
        run.articleId,
        run.templateId,
        run.templateName,
        run.lens,
        run.summary,
        JSON.stringify(run.technicalInsights),
        JSON.stringify(run.risks),
        JSON.stringify(run.reusableAngles),
        JSON.stringify(run.viralScore),
        JSON.stringify(run.topicCandidates),
        JSON.stringify(run.modelMetadata),
        run.createdAt,
      );

      for (const candidate of run.topicCandidates) {
        const timestamp = nowIso();
        db.prepare(`
          INSERT INTO topic_candidates (
            id, analysis_run_id, title, hook, target_reader, angle,
            evidence_article_ids_json, viral_score, status, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          candidate.id ?? createId("topic"),
          run.id,
          candidate.title,
          candidate.hook,
          candidate.targetReader,
          candidate.angle,
          JSON.stringify(candidate.evidenceArticleIds ?? [run.articleId]),
          candidate.viralScore,
          candidate.status ?? "new",
          candidate.createdAt ?? timestamp,
          candidate.updatedAt ?? timestamp,
        );
      }

      return run;
    },

    listAnalysisRuns(articleId?: string): AnalysisRun[] {
      const rows = articleId
        ? (db
            .prepare("SELECT * FROM analysis_runs WHERE article_id = ? ORDER BY created_at DESC")
            .all(articleId) as AnalysisRunRow[])
        : (db.prepare("SELECT * FROM analysis_runs ORDER BY created_at DESC").all() as AnalysisRunRow[]);
      return rows.map(mapAnalysisRun);
    },

    listTopicCandidates(): TopicCandidate[] {
      const rows = db
        .prepare("SELECT * FROM topic_candidates ORDER BY viral_score DESC, updated_at DESC")
        .all() as TopicCandidateRow[];
      return rows.map(mapTopicCandidate);
    },

    saveParseRun(run: ArticleParseRun): ArticleParseRun {
      db.prepare(`
        INSERT INTO article_parse_runs (
          id, article_id, url, status, strategy, quality_score,
          metadata_json, fallback_reason, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        run.id,
        run.articleId ?? null,
        run.url,
        run.status,
        run.strategy,
        run.qualityScore,
        JSON.stringify(run.metadata),
        run.fallbackReason,
        run.createdAt,
      );
      return run;
    },

    listParseRuns(articleId?: string): ArticleParseRun[] {
      const rows = articleId
        ? (db
            .prepare("SELECT * FROM article_parse_runs WHERE article_id = ? ORDER BY created_at DESC")
            .all(articleId) as ArticleParseRunRow[])
        : (db.prepare("SELECT * FROM article_parse_runs ORDER BY created_at DESC").all() as ArticleParseRunRow[]);
      return rows.map(mapArticleParseRun);
    },
  };
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(
    new Set(tags.map((tag) => tag.trim()).filter(Boolean)),
  );
}

function normalizeOriginalUrl(originalUrl?: string): string {
  const value = originalUrl?.trim();
  return value && value.length > 0 ? value : `local://${createId("source")}`;
}

function normalizeSourceType(input: ArticleSourceType | undefined, originalUrl: string): ArticleSourceType {
  if (input) {
    return input;
  }
  if (originalUrl.startsWith("local://")) {
    return "manual";
  }
  if (/mp\.weixin\.qq\.com/i.test(originalUrl)) {
    return "wechat";
  }
  return "web";
}

function normalizeRequiredText(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function normalizeContentHtml(input: ArticleInput): string {
  return (input.contentHtml ?? input.content ?? input.contentText ?? "").trim();
}

function normalizeContentText(input: ArticleInput, contentHtml: string): string {
  return (input.contentText ?? stripHtml(contentHtml)).trim();
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapArticle(row: ArticleRow): Article {
  const sourceName = row.source_name || row.source_account;
  const contentHtml = row.content_html || row.content;
  const contentText = row.content_text || stripHtml(contentHtml);
  return {
    id: row.id,
    title: row.title,
    sourceType: row.source_type || normalizeSourceType(undefined, row.original_url),
    sourceName,
    sourceAccount: sourceName,
    originalUrl: row.original_url,
    author: row.author,
    publishedAt: row.published_at,
    contentHtml,
    contentText,
    content: contentHtml || contentText,
    category: normalizeArticleCategory(row.category),
    isFavorite: Boolean(row.is_favorite),
    tags: parseJson<string[]>(row.tags_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAnalysisRun(row: AnalysisRunRow): AnalysisRun {
  return {
    id: row.id,
    articleId: row.article_id,
    templateId: row.template_id,
    templateName: row.template_name,
    lens: row.lens,
    summary: row.summary,
    technicalInsights: parseJson<string[]>(row.technical_insights_json, []),
    risks: parseJson<string[]>(row.risks_json, []),
    reusableAngles: parseJson<string[]>(row.reusable_angles_json, []),
    viralScore: parseJson<AnalysisRun["viralScore"]>(row.viral_score_json, {
      total: 0,
      dimensions: { pain: 0, novelty: 0, evidence: 0, debate: 0 },
      reasons: [],
    }),
    topicCandidates: parseJson<TopicCandidate[]>(row.topic_candidates_json, []),
    modelMetadata: parseJson<AnalysisRun["modelMetadata"]>(row.model_metadata_json, {
      provider: "openai-compatible",
      model: "",
    }),
    createdAt: row.created_at,
  };
}

function mapTopicCandidate(row: TopicCandidateRow): TopicCandidate {
  return {
    id: row.id,
    analysisRunId: row.analysis_run_id,
    title: row.title,
    hook: row.hook,
    targetReader: row.target_reader,
    angle: row.angle,
    evidenceArticleIds: parseJson<string[]>(row.evidence_article_ids_json, []),
    viralScore: row.viral_score,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapArticleParseRun(row: ArticleParseRunRow): ArticleParseRun {
  return {
    id: row.id,
    articleId: row.article_id,
    url: row.url,
    status: row.status,
    strategy: row.strategy,
    qualityScore: row.quality_score,
    metadata: parseJson<ArticleParseRun["metadata"]>(row.metadata_json, {}),
    fallbackReason: row.fallback_reason,
    createdAt: row.created_at,
  };
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
