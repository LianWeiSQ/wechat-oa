import type { SupabaseClient } from "@supabase/supabase-js";
import { stripHtml } from "@/lib/analysis";
import { normalizeArticleCategory, suggestArticleCategory } from "@/lib/article-categories";
import { createId, nowIso } from "@/lib/ids";
import {
  normalizeAiSettings,
  normalizeImageSize,
  sealSecret,
  toPublicImageSettings,
  toPublicWeChatConfig,
  unsealSecret,
} from "@/lib/settings";
import { getSupabaseConfig, getSupabaseServiceClient } from "@/lib/supabase";
import type {
  AiSettings,
  AnalysisRun,
  Article,
  ArticleInput,
  ArticleParseRun,
  ArticleSourceType,
  ContentAgentRun,
  ContentAgentStep,
  DraftImageAsset,
  ImageSettings,
  ImageSize,
  LocalDraft,
  PublicImageSettings,
  PublicWeChatConfig,
  WritingBlueprint,
  WritingStructure,
  WritingStructureRun,
  TopicCandidate,
  WeChatConfig,
} from "@/lib/types";

const DEFAULT_IMAGE_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_IMAGE_SIZE: ImageSize = "1536x1024";

type JsonRecord = Record<string, unknown>;

export function createSupabaseStores(client = getSupabaseServiceClient()) {
  const config = getSupabaseConfig();
  const workspaceId = config?.defaultWorkspaceId ?? "default";
  const articleStore = createSupabaseArticleStore(client, workspaceId);
  const draftStore = createSupabaseDraftStore(client, workspaceId);
  const settingsStore = createSupabaseSettingsStore(client, workspaceId);
  const draftImageStore = createSupabaseDraftImageStore(client, workspaceId);
  const contentAgentStore = createSupabaseContentAgentStore(client, workspaceId);
  const writingStore = createSupabaseWritingStore(client, workspaceId);

  return {
    articleStore,
    contentAgentStore,
    draftStore,
    draftImageStore,
    settingsStore,
    writingStore,
  };
}

function createSupabaseArticleStore(client: SupabaseClient, workspaceId: string) {
  return {
    async createArticle(input: ArticleInput): Promise<Article> {
      const originalUrl = normalizeOriginalUrl(input.originalUrl);
      const existing = await this.getArticleByUrl(originalUrl);
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

      await ensureWorkspace(client, workspaceId);
      const { error } = await client.from("articles").insert(toArticleRow(article, workspaceId));
      assertNoError(error, "保存文章失败");
      return article;
    },

    async getArticle(id: string): Promise<Article | null> {
      const { data, error } = await client
        .from("articles")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .maybeSingle();
      assertNoError(error, "读取文章失败");
      return data ? mapArticle(data as JsonRecord) : null;
    },

    async getArticleByUrl(originalUrl: string): Promise<Article | null> {
      const { data, error } = await client
        .from("articles")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("original_url", normalizeOriginalUrl(originalUrl))
        .maybeSingle();
      assertNoError(error, "按链接读取文章失败");
      return data ? mapArticle(data as JsonRecord) : null;
    },

    async updateArticle(id: string, input: Partial<ArticleInput>): Promise<Article | null> {
      const existing = await this.getArticle(id);
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

      const { error } = await client
        .from("articles")
        .update({
          title,
          source_type: sourceType,
          source_name: sourceName,
          source_account: sourceName,
          original_url: originalUrl,
          author: input.author ?? existing.author,
          published_at: input.publishedAt ?? existing.publishedAt,
          content_html: contentHtml,
          content_text: contentText,
          content: contentHtml || contentText,
          category,
          is_favorite: isFavorite,
          tags,
          updated_at: updatedAt,
        })
        .eq("workspace_id", workspaceId)
        .eq("id", id);
      assertNoError(error, "更新文章失败");
      return this.getArticle(id);
    },

    async deleteArticle(id: string): Promise<boolean> {
      const { count, error } = await client
        .from("articles")
        .delete({ count: "exact" })
        .eq("workspace_id", workspaceId)
        .eq("id", id);
      assertNoError(error, "删除文章失败");
      return (count ?? 0) > 0;
    },

    async listArticles(query = ""): Promise<Article[]> {
      const { data, error } = await client
        .from("articles")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false });
      assertNoError(error, "读取文章列表失败");
      const articles = ((data ?? []) as JsonRecord[]).map(mapArticle);
      const needle = query.trim().toLowerCase();
      if (!needle) {
        return articles;
      }
      return articles.filter((article) =>
        [article.title, article.sourceName, article.sourceAccount, article.author, article.category, article.tags.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );
    },

    async saveAnalysisRun(run: AnalysisRun): Promise<AnalysisRun> {
      const { error } = await client.from("analysis_runs").insert({
        id: run.id,
        workspace_id: workspaceId,
        article_id: run.articleId,
        template_id: run.templateId,
        template_name: run.templateName,
        lens: run.lens,
        summary: run.summary,
        technical_insights: run.technicalInsights,
        risks: run.risks,
        reusable_angles: run.reusableAngles,
        viral_score: run.viralScore,
        topic_candidates: run.topicCandidates,
        model_metadata: run.modelMetadata,
        created_at: run.createdAt,
      });
      assertNoError(error, "保存分析结果失败");

      const rows = run.topicCandidates.map((candidate) => {
        const timestamp = nowIso();
        return {
          id: candidate.id ?? createId("topic"),
          workspace_id: workspaceId,
          analysis_run_id: run.id,
          title: candidate.title,
          hook: candidate.hook,
          target_reader: candidate.targetReader,
          angle: candidate.angle,
          evidence_article_ids: candidate.evidenceArticleIds ?? [run.articleId],
          viral_score: candidate.viralScore,
          status: candidate.status ?? "new",
          created_at: candidate.createdAt ?? timestamp,
          updated_at: candidate.updatedAt ?? timestamp,
        };
      });
      if (rows.length > 0) {
        const result = await client.from("topic_candidates").insert(rows);
        assertNoError(result.error, "保存候选选题失败");
      }
      return run;
    },

    async listAnalysisRuns(articleId?: string): Promise<AnalysisRun[]> {
      let query = client
        .from("analysis_runs")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (articleId) {
        query = query.eq("article_id", articleId);
      }
      const { data, error } = await query;
      assertNoError(error, "读取分析结果失败");
      return ((data ?? []) as JsonRecord[]).map(mapAnalysisRun);
    },

    async listTopicCandidates(): Promise<TopicCandidate[]> {
      const { data, error } = await client
        .from("topic_candidates")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("viral_score", { ascending: false })
        .order("updated_at", { ascending: false });
      assertNoError(error, "读取候选选题失败");
      return ((data ?? []) as JsonRecord[]).map(mapTopicCandidate);
    },

    async saveParseRun(run: ArticleParseRun): Promise<ArticleParseRun> {
      const { error } = await client.from("article_parse_runs").insert({
        id: run.id,
        workspace_id: workspaceId,
        article_id: run.articleId ?? null,
        url: run.url,
        status: run.status,
        strategy: run.strategy,
        quality_score: run.qualityScore,
        metadata: run.metadata,
        fallback_reason: run.fallbackReason,
        created_at: run.createdAt,
      });
      assertNoError(error, "保存解析记录失败");
      return run;
    },

    async listParseRuns(articleId?: string): Promise<ArticleParseRun[]> {
      let query = client
        .from("article_parse_runs")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (articleId) {
        query = query.eq("article_id", articleId);
      }
      const { data, error } = await query;
      assertNoError(error, "读取解析记录失败");
      return ((data ?? []) as JsonRecord[]).map(mapArticleParseRun);
    },
  };
}

function createSupabaseContentAgentStore(client: SupabaseClient, workspaceId: string) {
  return {
    async saveAgentRun(run: ContentAgentRun): Promise<ContentAgentRun> {
      const { error } = await client.from("content_agent_runs").insert({
        id: run.id,
        workspace_id: workspaceId,
        article_id: run.articleId,
        status: run.status,
        steps: run.steps,
        article_type: run.articleType,
        quality_score: run.qualityScore,
        recommended_template_ids: run.recommendedTemplateIds,
        recommended_action: run.recommendedAction,
        reasoning_summary: run.reasoningSummary,
        created_at: run.createdAt,
      });
      assertNoError(error, "保存 Agent 记录失败");
      return run;
    },

    async listAgentRuns(articleId?: string): Promise<ContentAgentRun[]> {
      let query = client
        .from("content_agent_runs")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (articleId) {
        query = query.eq("article_id", articleId);
      }
      const { data, error } = await query;
      assertNoError(error, "读取 Agent 记录失败");
      return ((data ?? []) as JsonRecord[]).map(mapContentAgentRun);
    },
  };
}

function createSupabaseWritingStore(client: SupabaseClient, workspaceId: string) {
  return {
    async saveStructureRun(run: WritingStructureRun): Promise<WritingStructureRun> {
      const { error } = await client.from("writing_structure_runs").insert({
        id: run.id,
        workspace_id: workspaceId,
        article_id: run.articleId,
        structure: run.structure,
        quality_score: run.qualityScore,
        model_metadata: run.modelMetadata,
        created_at: run.createdAt,
      });
      assertNoError(error, "保存写作结构拆解失败");
      return run;
    },

    async listStructureRuns(articleId?: string): Promise<WritingStructureRun[]> {
      let query = client
        .from("writing_structure_runs")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (articleId) {
        query = query.eq("article_id", articleId);
      }
      const { data, error } = await query;
      assertNoError(error, "读取写作结构拆解失败");
      return ((data ?? []) as JsonRecord[]).map(mapWritingStructureRun);
    },

    async saveBlueprint(blueprint: WritingBlueprint): Promise<WritingBlueprint> {
      const { error } = await client.from("writing_blueprints").insert({
        id: blueprint.id,
        workspace_id: workspaceId,
        name: blueprint.name,
        source_article_ids: blueprint.sourceArticleIds,
        summary: blueprint.summary,
        section_plan: blueprint.sectionPlan,
        tone_rules: blueprint.toneRules,
        banned_expressions: blueprint.bannedExpressions,
        model_metadata: blueprint.modelMetadata,
        created_at: blueprint.createdAt,
        updated_at: blueprint.updatedAt,
      });
      assertNoError(error, "保存写作蓝图失败");
      return blueprint;
    },

    async listBlueprints(): Promise<WritingBlueprint[]> {
      const { data, error } = await client
        .from("writing_blueprints")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false });
      assertNoError(error, "读取写作蓝图失败");
      return ((data ?? []) as JsonRecord[]).map(mapWritingBlueprint);
    },

    async getBlueprint(id: string): Promise<WritingBlueprint | null> {
      const { data, error } = await client
        .from("writing_blueprints")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .maybeSingle();
      assertNoError(error, "读取写作蓝图失败");
      return data ? mapWritingBlueprint(data as JsonRecord) : null;
    },
  };
}

function createSupabaseDraftStore(client: SupabaseClient, workspaceId: string) {
  const store = {
    async createDraft(input: Pick<LocalDraft, "title" | "body" | "sourceAnalysisIds" | "exportFormat">): Promise<LocalDraft> {
      const timestamp = nowIso();
      const draft: LocalDraft = {
        id: createId("draft"),
        title: input.title.trim(),
        body: input.body.trim(),
        sourceAnalysisIds: input.sourceAnalysisIds,
        exportFormat: input.exportFormat,
        wechatDraftStatus: "not_sent",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const { error } = await client.from("drafts").insert({
        id: draft.id,
        workspace_id: workspaceId,
        title: draft.title,
        body: draft.body,
        source_analysis_ids: draft.sourceAnalysisIds,
        export_format: draft.exportFormat,
        wechat_draft_status: draft.wechatDraftStatus,
        wechat_media_id: draft.wechatMediaId ?? null,
        created_at: draft.createdAt,
        updated_at: draft.updatedAt,
      });
      assertNoError(error, "保存草稿失败");
      return draft;
    },

    async createDraftFromAnalysis(run: AnalysisRun): Promise<LocalDraft> {
      const topCandidate = [...run.topicCandidates].sort((a, b) => b.viralScore - a.viralScore)[0];
      const title = topCandidate?.title ?? `${run.templateName}：${run.summary.slice(0, 24)}`;
      const body = [
        `<h1>${escapeHtml(title)}</h1>`,
        `<p><strong>开头钩子：</strong>${escapeHtml(topCandidate?.hook ?? run.summary)}</p>`,
        `<h2>核心判断</h2>`,
        `<p>${escapeHtml(run.summary)}</p>`,
        `<h2>技术要点</h2>`,
        `<ul>${run.technicalInsights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
        `<h2>风险与反方问题</h2>`,
        `<ul>${run.risks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
      ].join("\n");
      return store.createDraft({
        title,
        body,
        sourceAnalysisIds: [run.id],
        exportFormat: "html",
      });
    },

    async getDraft(id: string): Promise<LocalDraft | null> {
      const { data, error } = await client
        .from("drafts")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .maybeSingle();
      assertNoError(error, "读取草稿失败");
      return data ? mapDraft(data as JsonRecord) : null;
    },

    async updateDraftBody(id: string, body: string): Promise<LocalDraft | null> {
      const { error } = await client
        .from("drafts")
        .update({ body: body.trim(), updated_at: nowIso() })
        .eq("workspace_id", workspaceId)
        .eq("id", id);
      assertNoError(error, "更新草稿失败");
      return store.getDraft(id);
    },

    async listDrafts(): Promise<LocalDraft[]> {
      const { data, error } = await client
        .from("drafts")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false });
      assertNoError(error, "读取草稿列表失败");
      return ((data ?? []) as JsonRecord[]).map(mapDraft);
    },

    async markWeChatResult(id: string, status: LocalDraft["wechatDraftStatus"], mediaId?: string): Promise<LocalDraft | null> {
      const { error } = await client
        .from("drafts")
        .update({
          wechat_draft_status: status,
          wechat_media_id: mediaId ?? null,
          updated_at: nowIso(),
        })
        .eq("workspace_id", workspaceId)
        .eq("id", id);
      assertNoError(error, "更新微信草稿状态失败");
      return store.getDraft(id);
    },
  };
  return store;
}

function createSupabaseDraftImageStore(client: SupabaseClient, workspaceId: string) {
  return {
    async createAsset(input: Omit<DraftImageAsset, "id" | "createdAt" | "updatedAt">): Promise<DraftImageAsset> {
      const timestamp = nowIso();
      const assetId = createId("asset");
      const imageAsset: DraftImageAsset = {
        id: createId("img"),
        draftId: input.draftId,
        role: input.role,
        status: input.status,
        localPath: input.localPath,
        publicPath: input.publicPath,
        prompt: input.prompt,
        revisedPrompt: input.revisedPrompt,
        alt: input.alt,
        caption: input.caption,
        model: input.model,
        size: input.size,
        error: input.error,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const assetInsert = await client.from("assets").insert({
        id: assetId,
        workspace_id: workspaceId,
        kind: "image",
        source_type: "generated-draft",
        status: imageAsset.status === "generated" ? "stored" : "failed",
        original_url: "",
        object_key: imageAsset.localPath,
        public_path: imageAsset.publicPath,
        sha256: "",
        mime_type: imageAsset.status === "generated" ? "image/png" : "",
        byte_size: 0,
        prompt: imageAsset.prompt,
        revised_prompt: imageAsset.revisedPrompt,
        alt: imageAsset.alt,
        caption: imageAsset.caption,
        model: imageAsset.model,
        error: imageAsset.error,
        created_at: imageAsset.createdAt,
        updated_at: imageAsset.updatedAt,
      });
      assertNoError(assetInsert.error, "保存图片资产失败");

      const linkInsert = await client.from("asset_links").insert({
        id: createId("link"),
        workspace_id: workspaceId,
        asset_id: assetId,
        target_type: "draft",
        target_id: imageAsset.draftId,
        role: imageAsset.role,
        sort_order: 0,
        caption: imageAsset.caption,
        created_at: imageAsset.createdAt,
      });
      assertNoError(linkInsert.error, "保存图片关联失败");

      const draftAssetInsert = await client.from("draft_image_assets").insert({
        id: imageAsset.id,
        workspace_id: workspaceId,
        draft_id: imageAsset.draftId,
        asset_id: assetId,
        role: imageAsset.role,
        status: imageAsset.status,
        local_path: imageAsset.localPath,
        public_path: imageAsset.publicPath,
        prompt: imageAsset.prompt,
        revised_prompt: imageAsset.revisedPrompt,
        alt: imageAsset.alt,
        caption: imageAsset.caption,
        model: imageAsset.model,
        size: imageAsset.size,
        error: imageAsset.error,
        created_at: imageAsset.createdAt,
        updated_at: imageAsset.updatedAt,
      });
      assertNoError(draftAssetInsert.error, "保存草稿图片记录失败");
      return imageAsset;
    },

    async updateAsset(id: string, input: Partial<Omit<DraftImageAsset, "id" | "createdAt" | "updatedAt">>): Promise<DraftImageAsset | null> {
      const current = await this.getAsset(id);
      if (!current) {
        return null;
      }
      const next = {
        ...current,
        ...input,
        updatedAt: nowIso(),
      };
      const { error } = await client
        .from("draft_image_assets")
        .update({
          draft_id: next.draftId,
          role: next.role,
          status: next.status,
          local_path: next.localPath,
          public_path: next.publicPath,
          prompt: next.prompt,
          revised_prompt: next.revisedPrompt,
          alt: next.alt,
          caption: next.caption,
          model: next.model,
          size: next.size,
          error: next.error,
          updated_at: next.updatedAt,
        })
        .eq("workspace_id", workspaceId)
        .eq("id", id);
      assertNoError(error, "更新草稿图片记录失败");
      return this.getAsset(id);
    },

    async getAsset(id: string): Promise<DraftImageAsset | null> {
      const { data, error } = await client
        .from("draft_image_assets")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .maybeSingle();
      assertNoError(error, "读取草稿图片失败");
      return data ? mapDraftImageAsset(data as JsonRecord) : null;
    },

    async listAssets(draftId?: string): Promise<DraftImageAsset[]> {
      let query = client
        .from("draft_image_assets")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order(draftId ? "created_at" : "updated_at", { ascending: Boolean(draftId) });
      if (draftId) {
        query = query.eq("draft_id", draftId);
      }
      const { data, error } = await query;
      assertNoError(error, "读取草稿图片列表失败");
      return ((data ?? []) as JsonRecord[]).map(mapDraftImageAsset);
    },
  };
}

function createSupabaseSettingsStore(client: SupabaseClient, workspaceId: string) {
  return {
    async getAiSettings(): Promise<AiSettings> {
      const saved = await getJson<Partial<AiSettings> & { apiKeyEncrypted?: string }>(client, workspaceId, "ai", {});
      return normalizeAiSettings({
        ...saved,
        apiKey: saved.apiKeyEncrypted ? unsealSecret(saved.apiKeyEncrypted) : saved.apiKey,
      });
    },

    async saveAiSettings(settings: Partial<AiSettings>): Promise<AiSettings> {
      const normalized = normalizeAiSettings(settings, await this.getAiSettings());
      await setJson(client, workspaceId, "ai", {
        modelProvider: normalized.modelProvider,
        baseUrl: normalized.baseUrl,
        apiKeyEncrypted: normalized.apiKey ? sealSecret(normalized.apiKey) : "",
        model: normalized.model,
        reviewModel: normalized.reviewModel,
        wireApi: normalized.wireApi,
        reasoningEffort: normalized.reasoningEffort,
        disableResponseStorage: normalized.disableResponseStorage,
      });
      return normalized;
    },

    async getImageSettings(): Promise<ImageSettings> {
      const saved = await getJson<{
        baseUrl?: string;
        apiKeyEncrypted?: string;
        model?: string;
        size?: string;
      }>(client, workspaceId, "image", {});
      return {
        baseUrl: saved.baseUrl ?? process.env.OPENAI_IMAGE_BASE_URL ?? DEFAULT_IMAGE_BASE_URL,
        apiKey: saved.apiKeyEncrypted
          ? unsealSecret(saved.apiKeyEncrypted)
          : process.env.OPENAI_IMAGE_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
        model: saved.model ?? process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL,
        size: normalizeImageSize(saved.size ?? process.env.OPENAI_IMAGE_SIZE ?? DEFAULT_IMAGE_SIZE),
      };
    },

    async getPublicImageSettings(): Promise<PublicImageSettings> {
      return toPublicImageSettings(await this.getImageSettings());
    },

    async saveImageSettings(input: Partial<ImageSettings>): Promise<ImageSettings> {
      const current = await this.getImageSettings();
      const next: ImageSettings = {
        baseUrl: input.baseUrl?.trim() || current.baseUrl,
        apiKey: input.apiKey?.trim() || current.apiKey,
        model: input.model?.trim() || current.model,
        size: normalizeImageSize(input.size ?? current.size),
      };
      await setJson(client, workspaceId, "image", {
        baseUrl: next.baseUrl,
        apiKeyEncrypted: next.apiKey ? sealSecret(next.apiKey) : "",
        model: next.model,
        size: next.size,
      });
      return next;
    },

    async getWeChatConfig(): Promise<WeChatConfig> {
      const saved = await getJson<{
        appId?: string;
        appSecretEncrypted?: string;
        defaultThumbMediaId?: string;
        tokenStatus?: WeChatConfig["tokenStatus"];
        lastCheckResult?: string;
        updatedAt?: string;
      }>(client, workspaceId, "wechat", {});
      return {
        appId: saved.appId ?? process.env.WECHAT_APP_ID ?? "",
        appSecret: saved.appSecretEncrypted
          ? unsealSecret(saved.appSecretEncrypted)
          : process.env.WECHAT_APP_SECRET ?? "",
        defaultThumbMediaId: saved.defaultThumbMediaId ?? process.env.WECHAT_THUMB_MEDIA_ID ?? "",
        tokenStatus: saved.tokenStatus ?? "unchecked",
        lastCheckResult: saved.lastCheckResult ?? "",
        updatedAt: saved.updatedAt ?? "",
      };
    },

    async getPublicWeChatConfig(): Promise<PublicWeChatConfig> {
      return toPublicWeChatConfig(await this.getWeChatConfig());
    },

    async saveWeChatConfig(input: Partial<WeChatConfig>): Promise<WeChatConfig> {
      const current = await this.getWeChatConfig();
      const next: WeChatConfig = {
        appId: input.appId?.trim() ?? current.appId,
        appSecret: input.appSecret?.trim() ?? current.appSecret,
        defaultThumbMediaId: input.defaultThumbMediaId?.trim() ?? current.defaultThumbMediaId,
        tokenStatus: input.tokenStatus ?? current.tokenStatus,
        lastCheckResult: input.lastCheckResult ?? current.lastCheckResult,
        updatedAt: nowIso(),
      };
      await setJson(client, workspaceId, "wechat", {
        appId: next.appId,
        appSecretEncrypted: next.appSecret ? sealSecret(next.appSecret) : "",
        defaultThumbMediaId: next.defaultThumbMediaId ?? "",
        tokenStatus: next.tokenStatus,
        lastCheckResult: next.lastCheckResult,
        updatedAt: next.updatedAt,
      });
      return next;
    },
  };
}

async function ensureWorkspace(client: SupabaseClient, workspaceId: string): Promise<void> {
  const { error } = await client.from("workspaces").upsert(
    {
      id: workspaceId,
      name: workspaceId === "default" ? "Default Workspace" : workspaceId,
      updated_at: nowIso(),
    },
    { onConflict: "id" },
  );
  assertNoError(error, "初始化 workspace 失败");
}

async function getJson<T>(client: SupabaseClient, workspaceId: string, key: string, fallback: T): Promise<T> {
  const { data, error } = await client
    .from("settings")
    .select("value")
    .eq("workspace_id", workspaceId)
    .eq("key", key)
    .maybeSingle();
  assertNoError(error, "读取设置失败");
  return data && isRecord((data as JsonRecord).value) ? ((data as JsonRecord).value as T) : fallback;
}

async function setJson(client: SupabaseClient, workspaceId: string, key: string, value: unknown): Promise<void> {
  await ensureWorkspace(client, workspaceId);
  const { error } = await client.from("settings").upsert(
    {
      workspace_id: workspaceId,
      key,
      value,
      updated_at: nowIso(),
    },
    { onConflict: "workspace_id,key" },
  );
  assertNoError(error, "保存设置失败");
}

function mapArticle(row: JsonRecord): Article {
  return {
    id: stringValue(row.id),
    title: stringValue(row.title),
    sourceType: sourceTypeValue(row.source_type),
    sourceName: stringValue(row.source_name || row.source_account),
    sourceAccount: stringValue(row.source_account || row.source_name),
    originalUrl: stringValue(row.original_url),
    author: stringValue(row.author),
    publishedAt: stringValue(row.published_at),
    contentHtml: stringValue(row.content_html || row.content),
    contentText: stringValue(row.content_text || row.content),
    content: stringValue(row.content || row.content_html || row.content_text),
    category: normalizeArticleCategory(stringValue(row.category)),
    isFavorite: Boolean(row.is_favorite),
    tags: arrayValue<string>(row.tags),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

function mapAnalysisRun(row: JsonRecord): AnalysisRun {
  return {
    id: stringValue(row.id),
    articleId: stringValue(row.article_id),
    templateId: stringValue(row.template_id),
    templateName: stringValue(row.template_name),
    lens: stringValue(row.lens),
    summary: stringValue(row.summary),
    technicalInsights: arrayValue<string>(row.technical_insights),
    risks: arrayValue<string>(row.risks),
    reusableAngles: arrayValue<string>(row.reusable_angles),
    viralScore: objectValue(row.viral_score) as AnalysisRun["viralScore"],
    topicCandidates: arrayValue<TopicCandidate>(row.topic_candidates),
    modelMetadata: objectValue(row.model_metadata) as AnalysisRun["modelMetadata"],
    createdAt: stringValue(row.created_at),
  };
}

function mapTopicCandidate(row: JsonRecord): TopicCandidate {
  return {
    id: stringValue(row.id),
    analysisRunId: stringValue(row.analysis_run_id),
    title: stringValue(row.title),
    hook: stringValue(row.hook),
    targetReader: stringValue(row.target_reader),
    angle: stringValue(row.angle),
    evidenceArticleIds: arrayValue<string>(row.evidence_article_ids),
    viralScore: numberValue(row.viral_score),
    status: stringValue(row.status) as TopicCandidate["status"],
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

function mapArticleParseRun(row: JsonRecord): ArticleParseRun {
  return {
    id: stringValue(row.id),
    articleId: stringValue(row.article_id) || undefined,
    url: stringValue(row.url),
    status: stringValue(row.status) as ArticleParseRun["status"],
    strategy: stringValue(row.strategy) as ArticleParseRun["strategy"],
    qualityScore: numberValue(row.quality_score),
    metadata: objectValue(row.metadata) as ArticleParseRun["metadata"],
    fallbackReason: stringValue(row.fallback_reason),
    createdAt: stringValue(row.created_at),
  };
}

function mapContentAgentRun(row: JsonRecord): ContentAgentRun {
  return {
    id: stringValue(row.id),
    articleId: stringValue(row.article_id),
    status: stringValue(row.status) as ContentAgentRun["status"],
    steps: arrayValue<ContentAgentStep>(row.steps),
    articleType: stringValue(row.article_type) as ContentAgentRun["articleType"],
    qualityScore: numberValue(row.quality_score),
    recommendedTemplateIds: arrayValue<string>(row.recommended_template_ids),
    recommendedAction: stringValue(row.recommended_action) as ContentAgentRun["recommendedAction"],
    reasoningSummary: stringValue(row.reasoning_summary),
    createdAt: stringValue(row.created_at),
  };
}

function mapWritingStructureRun(row: JsonRecord): WritingStructureRun {
  return {
    id: stringValue(row.id),
    articleId: stringValue(row.article_id),
    structure: objectValue(row.structure) as WritingStructure,
    qualityScore: numberValue(row.quality_score),
    modelMetadata: objectValue(row.model_metadata) as WritingStructureRun["modelMetadata"],
    createdAt: stringValue(row.created_at),
  };
}

function mapWritingBlueprint(row: JsonRecord): WritingBlueprint {
  return {
    id: stringValue(row.id),
    name: stringValue(row.name),
    sourceArticleIds: arrayValue<string>(row.source_article_ids),
    summary: stringValue(row.summary),
    sectionPlan: arrayValue<WritingBlueprint["sectionPlan"][number]>(row.section_plan),
    toneRules: arrayValue<string>(row.tone_rules),
    bannedExpressions: arrayValue<string>(row.banned_expressions),
    modelMetadata: objectValue(row.model_metadata) as WritingBlueprint["modelMetadata"],
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

function mapDraft(row: JsonRecord): LocalDraft {
  return {
    id: stringValue(row.id),
    title: stringValue(row.title),
    body: stringValue(row.body),
    sourceAnalysisIds: arrayValue<string>(row.source_analysis_ids),
    exportFormat: stringValue(row.export_format) as LocalDraft["exportFormat"],
    wechatDraftStatus: stringValue(row.wechat_draft_status) as LocalDraft["wechatDraftStatus"],
    wechatMediaId: stringValue(row.wechat_media_id) || undefined,
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

function mapDraftImageAsset(row: JsonRecord): DraftImageAsset {
  return {
    id: stringValue(row.id),
    draftId: stringValue(row.draft_id),
    role: stringValue(row.role) as DraftImageAsset["role"],
    status: stringValue(row.status) as DraftImageAsset["status"],
    localPath: stringValue(row.local_path),
    publicPath: stringValue(row.public_path),
    prompt: stringValue(row.prompt),
    revisedPrompt: stringValue(row.revised_prompt),
    alt: stringValue(row.alt),
    caption: stringValue(row.caption),
    model: stringValue(row.model),
    size: normalizeImageSize(stringValue(row.size)),
    error: stringValue(row.error),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

function toArticleRow(article: Article, workspaceId: string) {
  return {
    id: article.id,
    workspace_id: workspaceId,
    title: article.title,
    source_type: article.sourceType,
    source_name: article.sourceName,
    source_account: article.sourceAccount,
    original_url: article.originalUrl,
    author: article.author,
    published_at: article.publishedAt,
    content_html: article.contentHtml,
    content_text: article.contentText,
    content: article.content,
    category: article.category,
    is_favorite: article.isFavorite,
    tags: article.tags,
    created_at: article.createdAt,
    updated_at: article.updatedAt,
  };
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
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

function sourceTypeValue(value: unknown): ArticleSourceType {
  if (value === "web" || value === "wechat" || value === "manual") {
    return value;
  }
  return "web";
}

function arrayValue<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNoError(error: { message?: string } | null, context: string): void {
  if (error) {
    throw new Error(`${context}：${error.message ?? "Supabase 请求失败"}`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
