"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Database,
  FileText,
  MoreHorizontal,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  RefreshCw,
  Save,
  Scissors,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  DEFAULT_ARTICLE_CATEGORIES,
  articleCategory,
  normalizeArticleCategory,
  suggestArticleCategoryByAttribution,
} from "@/lib/article-categories";
import { DEFAULT_THEME_MODE, THEME_COOKIE_NAME, THEME_STORAGE_KEY, normalizeThemeMode } from "@/lib/theme";
import type {
  AnalysisRun,
  AnalysisTemplate,
  Article,
  ArticleParseRun,
  ContentChannel,
  ContentAgentRun,
  DraftImageAsset,
  LocalDraft,
  PublishStatus,
  SourceReuseWarning,
  WritingBlueprint,
  WritingStructureRun,
} from "@/lib/types";
import type { ThemeMode } from "@/lib/theme";

type WorkbenchProps = {
  initialArticles: Article[];
  initialDrafts?: LocalDraft[];
  templates: AnalysisTemplate[];
  initialAiSettings?: unknown;
  initialImageSettings?: unknown;
  initialWeChatConfig?: unknown;
  initialWritingBlueprints?: WritingBlueprint[];
  initialWritingStructureRuns?: WritingStructureRun[];
  initialThemeMode?: ThemeMode;
};

type Notice = {
  type: "ok" | "error" | "info";
  text: string;
};

type Workspace = "library" | "wechat" | "xiaohongshu";
type ImportMode = "url" | "manual";
type ActiveModal = "analysis" | "import" | "edit" | "manage" | null;
type ReaderDropdown = "actions" | "filters" | null;
type SourceFilter = "all" | Article["sourceType"];
type FavoriteFilter = "all" | "favorites";
type ProjectFilter = "全部";
type SortMode = "updatedDesc" | "publishedDesc" | "titleAsc" | "wordCountDesc" | "relevance";
type LibraryResult = {
  article: Article;
  matchedFields: string[];
  score: number;
  snippet: string;
};
type DraftEditorState = {
  title: string;
  body: string;
  notes: string;
  publishStatus: PublishStatus;
  plannedPublishAt: string;
};

const SUCCESS_NOTICE_DURATION_MS = 3000;
const ALL_CATEGORIES = "全部";
const ALL_SOURCES = "all" as const;
const ALL_PROJECTS = "全部";
const SEARCH_LOCALE = "zh-Hans-CN";

export function Workbench({
  initialArticles,
  initialDrafts = [],
  templates,
  initialWritingBlueprints = [],
  initialWritingStructureRuns = [],
  initialThemeMode = DEFAULT_THEME_MODE,
}: WorkbenchProps) {
  const [articles, setArticles] = useState(initialArticles);
  const [localDrafts, setLocalDrafts] = useState(initialDrafts);
  const [selectedId, setSelectedId] = useState(initialArticles[0]?.id ?? "");
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>("library");
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readStoredThemeMode() ?? initialThemeMode);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(ALL_SOURCES);
  const [projectFilter, setProjectFilter] = useState<ProjectFilter | string>(ALL_PROJECTS);
  const [favoriteFilter, setFavoriteFilter] = useState<FavoriteFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("updatedDesc");
  const [manageQuery, setManageQuery] = useState("");
  const [manageCategoryFilter, setManageCategoryFilter] = useState(ALL_CATEGORIES);
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? "");
  const [analysisRuns, setAnalysisRuns] = useState<AnalysisRun[]>([]);
  const [agentRuns, setAgentRuns] = useState<ContentAgentRun[]>([]);
  const [, setParseRuns] = useState<ArticleParseRun[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>("url");
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [readerDropdown, setReaderDropdown] = useState<ReaderDropdown>(null);
  const [libraryRailOpen, setLibraryRailOpen] = useState(true);
  const [editDraft, setEditDraft] = useState({ title: "", category: "", sourceProject: "", content: "" });
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [importFeedback, setImportFeedback] = useState<Notice | null>(null);
  const [writingBlueprints, setWritingBlueprints] = useState(initialWritingBlueprints);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState(initialWritingBlueprints[0]?.id ?? "");
  const [writingTopic, setWritingTopic] = useState("");
  const [referenceArticleIds, setReferenceArticleIds] = useState<string[]>(initialArticles[0] ? [initialArticles[0].id] : []);
  const [structureRuns, setStructureRuns] = useState<WritingStructureRun[]>(initialWritingStructureRuns);
  const [sourceReuseWarnings, setSourceReuseWarnings] = useState<SourceReuseWarning[]>([]);
  const [latestDraft, setLatestDraft] = useState<LocalDraft | null>(null);
  const [draftImageAssets, setDraftImageAssets] = useState<DraftImageAsset[]>([]);
  const initialSelectedDraft = firstPendingDraftForChannel(initialDrafts, "wechat");
  const [selectedDraftId, setSelectedDraftId] = useState(initialSelectedDraft?.id ?? "");
  const [draftEditor, setDraftEditor] = useState<DraftEditorState>(() => draftToEditorState(initialSelectedDraft));
  const [notice, setNotice] = useState<Notice | null>({ type: "info", text: "账号文章系统已就绪" });
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const deferredManageQuery = useDeferredValue(manageQuery);

  const libraryResults = useMemo(
    () =>
      buildLibraryResults(articles, {
        category: categoryFilter,
        favorite: favoriteFilter,
        project: projectFilter,
        query: deferredQuery,
        sort: sortMode,
        source: sourceFilter,
      }),
    [articles, categoryFilter, deferredQuery, favoriteFilter, projectFilter, sortMode, sourceFilter],
  );

  const filteredArticles = useMemo(() => libraryResults.map((result) => result.article), [libraryResults]);

  const categoryOptions = useMemo(
    () => uniqueCategories([...DEFAULT_ARTICLE_CATEGORIES, ...articles.map((article) => articleCategory(article))]),
    [articles],
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const article of articles) {
      const category = articleCategory(article);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return counts;
  }, [articles]);

  const sourceCounts = useMemo(() => {
    const counts = new Map<SourceFilter, number>();
    for (const article of articles) {
      counts.set(article.sourceType, (counts.get(article.sourceType) ?? 0) + 1);
    }
    return counts;
  }, [articles]);

  const projectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const article of articles) {
      const project = articleSourceProject(article);
      counts.set(project, (counts.get(project) ?? 0) + 1);
    }
    return counts;
  }, [articles]);

  const projectOptions = useMemo(() => Array.from(projectCounts.keys()).sort((left, right) => left.localeCompare(right, SEARCH_LOCALE)), [projectCounts]);

  const favoriteCount = useMemo(() => articles.filter(isArticleFavorite).length, [articles]);

  const filterCategoryOptions = useMemo(
    () => categoryOptions.filter((category) => (categoryCounts.get(category) ?? 0) > 0 || category === categoryFilter),
    [categoryCounts, categoryFilter, categoryOptions],
  );

  const managedArticles = useMemo(
    () =>
      buildLibraryResults(articles, {
        category: manageCategoryFilter,
        favorite: "all",
        project: ALL_PROJECTS,
        query: deferredManageQuery,
        sort: "updatedDesc",
        source: ALL_SOURCES,
      }).map((result) => result.article),
    [articles, deferredManageQuery, manageCategoryFilter],
  );

  const activeFilterCount = [
    query.trim(),
    categoryFilter !== ALL_CATEGORIES,
    sourceFilter !== ALL_SOURCES,
    projectFilter !== ALL_PROJECTS,
    favoriteFilter !== "all",
  ].filter(Boolean).length;

  const visibleSelectedId = useMemo(() => {
    if (selectedId && filteredArticles.some((article) => article.id === selectedId)) {
      return selectedId;
    }
    return filteredArticles[0]?.id ?? "";
  }, [filteredArticles, selectedId]);

  const selectedArticle = useMemo(
    () => articles.find((article) => article.id === visibleSelectedId) ?? null,
    [articles, visibleSelectedId],
  );

  const selectedAnalysisRuns = useMemo(
    () => analysisRuns.filter((run) => run.articleId === visibleSelectedId),
    [analysisRuns, visibleSelectedId],
  );

  const selectedAgentRuns = useMemo(
    () => agentRuns.filter((run) => run.articleId === visibleSelectedId),
    [agentRuns, visibleSelectedId],
  );

  const referenceArticleSet = useMemo(() => new Set(referenceArticleIds), [referenceArticleIds]);

  const selectedReferenceArticles = useMemo(
    () => articles.filter((article) => referenceArticleSet.has(article.id)),
    [articles, referenceArticleSet],
  );

  const selectedStructureRuns = useMemo(
    () => structureRuns.filter((run) => run.articleId === visibleSelectedId),
    [structureRuns, visibleSelectedId],
  );

  const selectedStructureRun = selectedStructureRuns[0] ?? null;

  const referenceStructureRuns = useMemo(
    () => structureRuns.filter((run) => referenceArticleSet.has(run.articleId)),
    [referenceArticleSet, structureRuns],
  );

  const selectedBlueprint = useMemo(
    () => writingBlueprints.find((blueprint) => blueprint.id === selectedBlueprintId) ?? null,
    [selectedBlueprintId, writingBlueprints],
  );

  const activeContentChannel = activeWorkspace === "xiaohongshu" ? "xiaohongshu" : "wechat";
  const isContentWorkspace = activeWorkspace !== "library";

  const channelDrafts = useMemo(
    () => localDrafts.filter((draft) => draftChannel(draft) === activeContentChannel).sort(compareDraftQueue),
    [activeContentChannel, localDrafts],
  );

  const pendingChannelDrafts = useMemo(() => channelDrafts.filter(isPendingDraft), [channelDrafts]);

  const channelStats = useMemo(() => buildDraftStats(channelDrafts), [channelDrafts]);

  const selectedLocalDraft = useMemo(
    () => pendingChannelDrafts.find((draft) => draft.id === selectedDraftId) ?? pendingChannelDrafts[0] ?? null,
    [pendingChannelDrafts, selectedDraftId],
  );

  useEffect(() => {
    if (notice?.type !== "ok") {
      return;
    }

    const timer = window.setTimeout(() => {
      setNotice((current) => (current?.type === "ok" ? null : current));
    }, SUCCESS_NOTICE_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (importFeedback?.type !== "ok") {
      return;
    }

    const timer = window.setTimeout(() => {
      setImportFeedback((current) => (current?.type === "ok" ? null : current));
    }, SUCCESS_NOTICE_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [importFeedback]);

  useEffect(() => {
    if (!activeModal && !readerDropdown) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveModal(null);
        setReaderDropdown(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeModal, readerDropdown]);

  function updateQuery(value: string) {
    setQuery(value);
  }

  function updateCategoryFilter(category: string) {
    setCategoryFilter(category);
  }

  function clearLibraryFilters() {
    setQuery("");
    setCategoryFilter(ALL_CATEGORIES);
    setSourceFilter(ALL_SOURCES);
    setProjectFilter(ALL_PROJECTS);
    setFavoriteFilter("all");
    setSortMode("updatedDesc");
  }

  async function handleManualImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy("manual-import");
    const form = new FormData(formElement);
    const payload = {
      title: String(form.get("title") ?? ""),
      sourceName: String(form.get("sourceName") ?? ""),
      sourceProject: String(form.get("sourceProject") ?? ""),
      sourceType: "manual",
      originalUrl: String(form.get("originalUrl") ?? ""),
      author: String(form.get("author") ?? ""),
      publishedAt: String(form.get("publishedAt") ?? ""),
      category: String(form.get("category") ?? ""),
      tags: String(form.get("tags") ?? "")
        .split(/[，,]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      contentText: String(form.get("contentText") ?? ""),
    };
    setImportFeedback(null);

    const response = await fetch("/api/library/import/manual", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    setBusy(null);
    if (!response.ok) {
      const text = data.error ?? "保存到引用素材库失败";
      setNotice({ type: "error", text: `保存失败：${text}` });
      setImportFeedback({ type: "error", text });
      return;
    }
    setArticles((current) => upsertArticle(current, data.article));
    setSelectedId(data.article.id);
    setNotice({ type: "ok", text: `已保存到引用素材库：${data.article.title}` });
    setImportFeedback(null);
    setActiveModal(null);
    formElement.reset();
  }

  async function handleUrlImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy("url-import");
    const form = new FormData(formElement);
    setImportFeedback(null);
    const response = await fetch("/api/library/import/url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: String(form.get("url") ?? ""),
        sourceProject: String(form.get("sourceProject") ?? ""),
      }),
    });
    const data = await response.json();
    setBusy(null);
    if (!response.ok || data.ok === false) {
      const text = data.reason ?? "链接解析失败，请改用手动粘贴";
      setNotice({ type: "error", text: `链接解析失败：${text}` });
      setImportFeedback({ type: "error", text });
      setImportMode("manual");
      return;
    }
    setArticles((current) => upsertArticle(current, data.article));
    if (data.parseRun) {
      setParseRuns((current) => [data.parseRun, ...current]);
    }
    setSelectedId(data.article.id);
    setNotice({ type: "ok", text: `已保存到引用素材库：${data.article.title}` });
    setImportFeedback(null);
    setActiveModal(null);
    formElement.reset();
  }

  function openEditModal(article = selectedArticle) {
    if (!article) {
      return;
    }
    setSelectedId(article.id);
    setEditDraft({
      title: article.title,
      category: articleCategory(article),
      sourceProject: articleSourceProject(article),
      content: editableHtmlFromArticle(article),
    });
    setActiveModal("edit");
  }

  function handleAutoCleanEditDraft() {
    const content = editorRef.current?.innerHTML ?? editDraft.content;
    const cleanedContent = autoCleanEditableContent(content);
    if (editorRef.current) {
      editorRef.current.innerHTML = cleanedContent;
    }
    setEditDraft((current) => ({
      ...current,
      content: cleanedContent,
    }));
    setNotice({ type: "info", text: "已自动裁剪导入杂项，保存后生效" });
  }

  async function handleArticleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedArticle) {
      return;
    }
    const contentHtml = (editorRef.current?.innerHTML ?? editDraft.content).trim();
    if (!editDraft.title.trim() || !htmlTextContent(contentHtml).trim()) {
      setNotice({ type: "error", text: "标题和正文不能为空" });
      return;
    }

    setBusy("article-edit");
    const response = await fetch(`/api/library/articles/${selectedArticle.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: editDraft.title,
        category: editDraft.category,
        sourceProject: editDraft.sourceProject,
        contentHtml,
      }),
    });
    const data = await response.json();
    setBusy(null);
    if (!response.ok) {
      setNotice({ type: "error", text: data.error ?? "正文保存失败" });
      return;
    }
    setArticles((current) => upsertArticle(current, data.article));
    setSelectedId(data.article.id);
    setNotice({ type: "ok", text: "正文已更新" });
    setActiveModal(null);
  }

  async function patchArticle(articleId: string, payload: Partial<Article>) {
    const response = await fetch(`/api/library/articles/${articleId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "引用素材更新失败");
    }
    setArticles((current) => upsertArticle(current, data.article));
    return data.article as Article;
  }

  async function handleCategorySave(article: Article, category: string) {
    const nextCategory = normalizeArticleCategory(category);
    setBusy(`category-${article.id}`);
    try {
      await patchArticle(article.id, { category: nextCategory });
      setNotice({ type: "ok", text: `已更新分类：${nextCategory}` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "分类保存失败" });
    } finally {
      setBusy(null);
    }
  }

  async function handleArticleMetaSave(article: Article, input: { category: string; sourceProject: string }) {
    const nextCategory = normalizeArticleCategory(input.category);
    setBusy(`category-${article.id}`);
    try {
      await patchArticle(article.id, {
        category: nextCategory,
        sourceProject: input.sourceProject.trim() || articleSourceProject(article),
      });
      setNotice({ type: "ok", text: `已更新引用信息：${nextCategory}` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "引用信息保存失败" });
    } finally {
      setBusy(null);
    }
  }

  async function handleFavoriteToggle(article: Article) {
    const nextFavorite = !isArticleFavorite(article);
    setBusy(`favorite-${article.id}`);
    try {
      await patchArticle(article.id, { isFavorite: nextFavorite });
      setNotice({
        type: "ok",
        text: nextFavorite ? `已加入特别收藏：${article.title}` : `已取消特别收藏：${article.title}`,
      });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "收藏状态保存失败" });
    } finally {
      setBusy(null);
    }
  }

  async function handleSuggestedCategorySave(article: Article) {
    await handleCategorySave(article, suggestArticleCategoryByAttribution(article));
  }

  async function handleDeleteArticle(article: Article) {
    if (pendingDeleteId !== article.id) {
      setPendingDeleteId(article.id);
      setNotice({ type: "info", text: `再次点击确认删除：${article.title}` });
      return;
    }

    setBusy(`delete-${article.id}`);
    try {
      const response = await fetch(`/api/library/articles/${article.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "引用素材删除失败");
      }
      setArticles((current) => {
        const next = current.filter((item) => item.id !== article.id);
        if (selectedId === article.id) {
          setSelectedId(next[0]?.id ?? "");
        }
        return next;
      });
      setAnalysisRuns((current) => current.filter((run) => run.articleId !== article.id));
      setAgentRuns((current) => current.filter((run) => run.articleId !== article.id));
      setStructureRuns((current) => current.filter((run) => run.articleId !== article.id));
      setPendingDeleteId(null);
      setNotice({ type: "ok", text: `已删除引用素材：${article.title}` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "引用素材删除失败" });
    } finally {
      setBusy(null);
    }
  }

  async function handleBulkSuggestCategories() {
    setBusy("category-bulk");
    try {
      const updatedArticles = await mapWithConcurrency(articles, 8, (article) =>
        patchArticle(article.id, { category: suggestArticleCategoryByAttribution(article) }),
      );
      setArticles((current) =>
        current.map((article) => updatedArticles.find((updated) => updated.id === article.id) ?? article),
      );
      setNotice({ type: "ok", text: "已完成全部外部素材智能分类" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "智能分类失败" });
    } finally {
      setBusy(null);
    }
  }

  async function handleAnalyze() {
    if (!selectedArticle) {
      return;
    }
    setBusy("analyze");
    const response = await fetch(`/api/library/articles/${selectedArticle.id}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateId: selectedTemplateId }),
    });
    const data = await response.json();
    setBusy(null);
    if (!response.ok) {
      setNotice({ type: "error", text: data.error ?? "AI 拆解失败" });
      return;
    }
    setAnalysisRuns((current) => [data.analysisRun, ...current]);
    setNotice({ type: "ok", text: "拆解完成，候选角度已生成" });
  }

  async function handleAgent() {
    if (!selectedArticle) {
      return;
    }
    setBusy("agent");
    setNotice({ type: "info", text: "Agent 正在判断解析质量和分析策略" });
    const response = await fetch(`/api/library/articles/${selectedArticle.id}/agent`, {
      method: "POST",
    });
    const data = await response.json();
    setBusy(null);
    if (!response.ok && !data.agentRun) {
      setNotice({ type: "error", text: data.error ?? "智能处理失败" });
      return;
    }
    setAgentRuns((current) => [data.agentRun, ...current]);
    setNotice({
      type: data.agentRun.status === "completed" ? "ok" : "error",
      text: data.agentRun.status === "completed" ? "智能处理完成" : data.agentRun.reasoningSummary,
    });
  }

  function toggleReferenceArticle(articleId: string) {
    setReferenceArticleIds((current) =>
      current.includes(articleId) ? current.filter((id) => id !== articleId) : [...current, articleId],
    );
  }

  function applyStructureRuns(nextRuns: WritingStructureRun[]) {
    if (nextRuns.length === 0) {
      return;
    }
    setStructureRuns((current) => upsertStructureRuns(current, nextRuns));
  }

  async function handleWritingStructure() {
    if (!selectedArticle) {
      return;
    }
    setBusy("writing-structure");
    setNotice({ type: "info", text: "正在拆解当前素材的写作结构" });
    const response = await fetch(`/api/library/articles/${selectedArticle.id}/structure`, {
      method: "POST",
    });
    const data = await response.json();
    setBusy(null);
    if (!response.ok) {
      setNotice({ type: "error", text: data.error ?? "写作结构拆解失败" });
      return;
    }
    applyStructureRuns([data.structureRun]);
    if (!referenceArticleIds.includes(selectedArticle.id)) {
      setReferenceArticleIds((current) => [...current, selectedArticle.id]);
    }
    setNotice({ type: "ok", text: "写作结构已拆解，已生成可复用结构资产" });
  }

  async function handleWritingBlueprint() {
    if (referenceArticleIds.length === 0) {
      setNotice({ type: "error", text: "请至少选择一篇参考素材" });
      return;
    }
    setBusy("writing-blueprint");
    setNotice({ type: "info", text: "正在聚合参考素材的写作结构蓝图" });
    const response = await fetch("/api/writing/blueprints", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ articleIds: referenceArticleIds }),
    });
    const data = await response.json();
    setBusy(null);
    if (!response.ok) {
      setNotice({ type: "error", text: data.error ?? "写作蓝图生成失败" });
      return;
    }
    setWritingBlueprints((current) => [data.blueprint, ...current.filter((blueprint) => blueprint.id !== data.blueprint.id)]);
    setSelectedBlueprintId(data.blueprint.id);
    applyStructureRuns(data.structureRuns ?? []);
    setNotice({ type: "ok", text: "写作蓝图已生成" });
  }

  async function handleOriginalDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (referenceArticleIds.length === 0) {
      setNotice({ type: "error", text: "请至少选择一篇参考素材" });
      return;
    }
    setBusy("writing-draft");
    setNotice({ type: "info", text: "正在根据选题生成本地创作文章" });
    const response = await fetch("/api/writing/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        topic: writingTopic,
        referenceArticleIds,
        blueprintId: selectedBlueprintId || undefined,
        channel: activeContentChannel,
      }),
    });
    const data = await response.json();
    setBusy(null);
    if (!response.ok) {
      setNotice({ type: "error", text: data.error ?? "原创文章生成失败" });
      return;
    }
    setLatestDraft(data.draft);
    setLocalDrafts((current) => upsertDraft(current, data.draft));
    if (draftChannel(data.draft) === activeContentChannel) {
      selectDraftForEditing(data.draft);
    }
    applyStructureRuns(data.structureRuns ?? []);
    setDraftImageAssets([]);
    setSourceReuseWarnings(data.warnings ?? []);
    const reviewScore = typeof data.review?.score === "number" ? `，审稿 ${data.review.score} 分` : "";
    setNotice({
      type: (data.warnings ?? []).length > 0 ? "info" : "ok",
      text: (data.warnings ?? []).length > 0 ? `原创文章已生成${reviewScore}，但发现疑似长句复用` : `原创文章草稿已生成${reviewScore}`,
    });
  }

  async function handleProfessionalDraft() {
    if (!selectedArticle) {
      return;
    }
    setBusy("professional-draft");
    setNotice({ type: "info", text: "正在生成专业长文和配图" });
    const response = await fetch(`/api/wechat/articles/${selectedArticle.id}/professional-draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ analysisRunId: selectedAnalysisRuns[0]?.id }),
    });
    const data = await response.json();
    setBusy(null);
    if (!response.ok) {
      setNotice({ type: "error", text: data.error ?? "专业长文生成失败" });
      return;
    }
    setLatestDraft(data.draft);
    setLocalDrafts((current) => upsertDraft(current, data.draft));
    if (draftChannel(data.draft) === activeContentChannel) {
      selectDraftForEditing(data.draft);
    }
    setDraftImageAssets(data.imageAssets ?? []);
    setSourceReuseWarnings([]);
    const failedCount = (data.imageAssets ?? []).filter((asset: DraftImageAsset) => asset.status === "failed").length;
    setNotice({
      type: failedCount > 0 ? "info" : "ok",
      text: failedCount > 0 ? `专业长文已生成，${failedCount} 张配图待处理` : "专业长文和配图已生成",
    });
  }

  async function patchLocalDraft(draftId: string, payload: Partial<LocalDraft>): Promise<LocalDraft> {
    const response = await fetch(`/api/content/drafts/${draftId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "本地文章更新失败");
    }
    setLocalDrafts((current) => upsertDraft(current, data.draft));
    return data.draft as LocalDraft;
  }

  function selectDraftForEditing(draft: LocalDraft | null) {
    setSelectedDraftId(draft?.id ?? "");
    setDraftEditor(draftToEditorState(draft));
  }

  function handleDraftSelect(draftId: string) {
    const draft = pendingChannelDrafts.find((item) => item.id === draftId) ?? null;
    selectDraftForEditing(draft);
  }

  async function handleDraftStatusChange(draft: LocalDraft, publishStatus: PublishStatus) {
    setBusy(`draft-status-${draft.id}`);
    try {
      const payload: Partial<LocalDraft> = {
        publishStatus,
        publishedAt: publishStatus === "published" ? new Date().toISOString() : "",
      };
      const updated = await patchLocalDraft(draft.id, payload);
      if (selectedDraftId === draft.id) {
        if (publishStatus === "published" || publishStatus === "archived") {
          const nextDraft = channelDrafts.find((item) => item.id !== draft.id && draftChannel(item) === draftChannel(draft) && isPendingDraft(item)) ?? null;
          selectDraftForEditing(nextDraft);
        } else {
          selectDraftForEditing(updated);
        }
      }
      setNotice({ type: "ok", text: publishStatus === "published" ? `已标记发布：${draft.title}` : `已更新本地文章状态：${publishStatusLabel(publishStatus)}` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "本地文章状态更新失败" });
    } finally {
      setBusy(null);
    }
  }

  async function handleDraftReorder(draft: LocalDraft, direction: -1 | 1) {
    const index = channelDrafts.findIndex((item) => item.id === draft.id);
    const neighbor = channelDrafts[index + direction];
    if (!neighbor) {
      return;
    }
    setBusy(`draft-order-${draft.id}`);
    try {
      const draftOrder = draft.queueOrder ?? index + 1;
      const neighborOrder = neighbor.queueOrder ?? index + direction + 1;
      await Promise.all([
        patchLocalDraft(draft.id, { queueOrder: neighborOrder }),
        patchLocalDraft(neighbor.id, { queueOrder: draftOrder }),
      ]);
      setNotice({ type: "ok", text: "发布顺序已调整" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "顺序调整失败" });
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateBlankDraft() {
    setBusy("draft-create");
    try {
      const response = await fetch("/api/content/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: activeContentChannel === "wechat" ? "未命名公众号草稿" : "未命名小红书笔记",
          body: "<p>在这里整理正文。</p>",
          contentChannel: activeContentChannel,
          publishStatus: "draft",
          sourceArticleIds: [],
          exportFormat: "html",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "新建本地文章失败");
      }
      setLocalDrafts((current) => upsertDraft(current, data.draft));
      selectDraftForEditing(data.draft);
      setNotice({ type: "ok", text: "已新建空白本地文章" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "新建本地文章失败" });
    } finally {
      setBusy(null);
    }
  }

  async function handleDraftEditorSave() {
    if (!selectedLocalDraft) {
      return;
    }
    if (!draftEditor.title.trim() || !stripPreviewHtml(draftEditor.body).trim()) {
      setNotice({ type: "error", text: "标题和正文不能为空" });
      return;
    }
    setBusy(`draft-edit-${selectedLocalDraft.id}`);
    try {
      const updated = await patchLocalDraft(selectedLocalDraft.id, {
        title: draftEditor.title,
        body: draftEditor.body,
        notes: draftEditor.notes,
        publishStatus: draftEditor.publishStatus,
        plannedPublishAt: draftEditor.plannedPublishAt,
      });
      selectDraftForEditing(updated);
      setNotice({ type: "ok", text: "草稿正文已保存" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "草稿保存失败" });
    } finally {
      setBusy(null);
    }
  }

  const workspaceKicker =
    activeWorkspace === "library" ? "外部引用素材" : localArticleCollectionLabel(activeContentChannel);
  const nextThemeMode = themeMode === "dark" ? "light" : "dark";
  const isLibraryEmptyState = activeWorkspace === "library" && !selectedArticle;

  function handleThemeModeToggle() {
    setThemeMode((current) => {
      const next = current === "dark" ? "light" : "dark";
      writeThemePreference(next);
      return next;
    });
  }

  function handleArticleSelectFromLibrary(articleId: string) {
    setSelectedId(articleId);
    setPendingDeleteId(null);
  }

  function openContentWorkspace(workspace: Exclude<Workspace, "library">) {
    const channel = workspace === "xiaohongshu" ? "xiaohongshu" : "wechat";
    setActiveWorkspace(workspace);
    setActiveModal(null);
    setReaderDropdown(null);
    selectDraftForEditing(firstPendingDraftForChannel(localDrafts, channel));
  }

  return (
    <main className="studio-shell" data-theme={themeMode}>
      <header className="studio-topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Database className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <div className="brand-title">账号文章系统</div>
            <div className="brand-meta">
              {articles.length} 篇外部引用素材 · {localDrafts.length} 篇本地创作文章
            </div>
          </div>
        </div>

        <div className="topbar-actions">
          <nav className="workspace-switch" aria-label="工作区">
            <button
              type="button"
              onClick={() => {
                setActiveWorkspace("library");
                setActiveModal(null);
                setReaderDropdown(null);
              }}
              className={workspaceButtonClassName(activeWorkspace === "library")}
            >
              外部引用素材
            </button>
            <button
              type="button"
              onClick={() => {
                openContentWorkspace("wechat");
              }}
              className={workspaceButtonClassName(activeWorkspace === "wechat")}
            >
              公众号本地文章
            </button>
            <button
              type="button"
              onClick={() => {
                openContentWorkspace("xiaohongshu");
              }}
              className={workspaceButtonClassName(activeWorkspace === "xiaohongshu")}
            >
              小红书本地文章
            </button>
          </nav>
          <button
            type="button"
            className="theme-toggle"
            aria-label={`切换到${nextThemeMode === "light" ? "浅色" : "深色"}模式`}
            onClick={handleThemeModeToggle}
          >
            {themeMode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {nextThemeMode === "light" ? "浅色" : "深色"}
          </button>
          <Link href="/settings" className="topbar-settings-button" aria-label="打开配置中心">
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <div
        className={`workspace-frame ${isContentWorkspace ? "workspace-frame-wechat" : "workspace-frame-reading"} ${
          activeWorkspace === "library" && !libraryRailOpen ? "workspace-frame-rail-collapsed" : ""
        }`}
      >
        {activeWorkspace === "library" && libraryRailOpen ? (
          <ArticleLibraryPanel
            articles={articles}
            busy={busy}
            libraryResults={libraryResults}
            onArticleSelect={handleArticleSelectFromLibrary}
            onClose={() => {
              setLibraryRailOpen(false);
            }}
            onFavoriteToggle={handleFavoriteToggle}
            query={query}
            selectedArticleId={visibleSelectedId}
            sortMode={sortMode}
            updateQuery={updateQuery}
          />
        ) : null}
        {activeWorkspace === "library" && !libraryRailOpen ? (
          <button
            type="button"
            className="library-rail-handle"
            aria-label="从左侧展开素材栏"
            aria-expanded={libraryRailOpen}
            onClick={() => setLibraryRailOpen(true)}
          >
            <PanelLeftOpen className="h-4 w-4" />
            素材列表
          </button>
        ) : null}

        <section className="reader-stage">
          <header className={`reader-header ${isLibraryEmptyState ? "reader-header-empty" : ""}`}>
            <div className={`reader-heading ${isLibraryEmptyState ? "reader-heading-empty" : ""}`}>
              <div className="kicker">{workspaceKicker}</div>
              <h1 className={`reader-title ${isLibraryEmptyState ? "reader-title-empty" : ""}`}>
                {isContentWorkspace ? channelPageTitle(activeContentChannel) : selectedArticle?.title ?? "选择引用素材"}
              </h1>
            </div>
            <div className="reader-toolbar">
              {activeWorkspace === "library" ? (
                <button
                  type="button"
                  className="tool-button reader-rail-toggle"
                  aria-expanded={libraryRailOpen}
                  onClick={() => {
                    if (libraryRailOpen) {
                      setLibraryRailOpen(false);
                      return;
                    }
                    setLibraryRailOpen(true);
                  }}
                >
                  {libraryRailOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                  {libraryRailOpen ? "收起素材栏" : "展开素材栏"}
                </button>
              ) : null}
              {notice ? <StatusBadge notice={notice} /> : null}
              {activeWorkspace === "library" ? (
                <>
                  <div className="reader-menu-wrap">
                    <button
                      type="button"
                      className={`tool-button ${readerDropdown === "filters" ? "tool-button-active" : ""}`}
                      aria-expanded={readerDropdown === "filters"}
                      aria-controls="reader-filter-menu"
                      onClick={() => setReaderDropdown((current) => (current === "filters" ? null : "filters"))}
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                      {activeFilterCount > 0 ? `筛选（${activeFilterCount}）` : "筛选"}
                    </button>
                    {readerDropdown === "filters" ? (
                      <div id="reader-filter-menu" className="reader-filter-popover" aria-label="引用素材筛选">
                        <button
                          type="button"
                          className={`reader-favorite-filter ${favoriteFilter === "favorites" ? "reader-favorite-filter-active" : ""}`}
                          aria-label={favoriteFilter === "favorites" ? "显示全部引用素材" : "只看特别收藏"}
                          onClick={() => setFavoriteFilter((current) => (current === "favorites" ? "all" : "favorites"))}
                        >
                          <Star className="h-4 w-4" />
                          特别收藏（{favoriteCount}）
                        </button>
                        <label className="reader-filter-control">
                          <span>分类</span>
                          <select value={categoryFilter} onChange={(event) => updateCategoryFilter(event.target.value)} className="field">
                            <option value={ALL_CATEGORIES}>全部分类（{articles.length}）</option>
                            {filterCategoryOptions.map((category) => (
                              <option key={category} value={category}>
                                {category}（{categoryCounts.get(category) ?? 0}）
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="reader-filter-control">
                          <span>来源</span>
                          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)} className="field">
                            <option value={ALL_SOURCES}>全部来源（{articles.length}）</option>
                            <option value="wechat">公众号（{sourceCounts.get("wechat") ?? 0}）</option>
                            <option value="web">网页（{sourceCounts.get("web") ?? 0}）</option>
                            <option value="manual">手动（{sourceCounts.get("manual") ?? 0}）</option>
                          </select>
                        </label>
                        <label className="reader-filter-control">
                          <span>项目来源</span>
                          <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className="field">
                            <option value={ALL_PROJECTS}>全部项目（{articles.length}）</option>
                            {projectOptions.map((project) => (
                              <option key={project} value={project}>
                                {project}（{projectCounts.get(project) ?? 0}）
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="reader-filter-control">
                          <span>排序</span>
                          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="field">
                            <option value="updatedDesc">最近更新</option>
                            <option value="publishedDesc">发布时间</option>
                            <option value="relevance">相关度</option>
                            <option value="wordCountDesc">正文最长</option>
                            <option value="titleAsc">标题 A-Z</option>
                          </select>
                        </label>
                        <span className="reader-filter-count">当前 {filteredArticles.length} 篇</span>
                        {activeFilterCount > 0 ? (
                          <button type="button" className="text-button" aria-label="清除检索条件" onClick={clearLibraryFilters}>
                            <X className="h-3.5 w-3.5" />
                            清除
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="reader-menu-wrap">
                    <button
                      type="button"
                      className="tool-button tool-button-primary"
                      aria-label="素材操作"
                      aria-expanded={readerDropdown === "actions"}
                      aria-controls="reader-action-menu"
                      onClick={() => setReaderDropdown((current) => (current === "actions" ? null : "actions"))}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                      操作
                    </button>
                    {readerDropdown === "actions" ? (
                      <div id="reader-action-menu" className="reader-action-popover" aria-label="素材操作菜单">
                        <button
                          type="button"
                          className={`reader-menu-action favorite-action ${selectedArticle && isArticleFavorite(selectedArticle) ? "favorite-action-active" : ""}`}
                          disabled={!selectedArticle || busy === `favorite-${selectedArticle?.id ?? ""}`}
                          aria-label={selectedArticle && isArticleFavorite(selectedArticle) ? "取消特别收藏当前素材" : "特别收藏当前素材"}
                          onClick={() => {
                            if (selectedArticle) {
                              void handleFavoriteToggle(selectedArticle);
                            }
                            setReaderDropdown(null);
                          }}
                        >
                          <Star className="h-4 w-4" />
                          {selectedArticle && isArticleFavorite(selectedArticle) ? "已收藏" : "特别收藏"}
                        </button>
                        <button
                          type="button"
                          className="reader-menu-action"
                          onClick={() => {
                            setActiveModal("manage");
                            setReaderDropdown(null);
                          }}
                        >
                          <Settings className="h-4 w-4" />
                          管理引用素材
                        </button>
                        <button
                          type="button"
                          className="reader-menu-action"
                          disabled={!selectedArticle}
                          onClick={() => {
                            openEditModal();
                            setReaderDropdown(null);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                          编辑素材正文
                        </button>
                        <button
                          type="button"
                          className="reader-menu-action"
                          disabled={!selectedArticle}
                          onClick={() => {
                            setActiveModal("analysis");
                            setReaderDropdown(null);
                          }}
                        >
                          <Brain className="h-4 w-4" />
                          AI 拆解
                        </button>
                        <button
                          type="button"
                          className="reader-menu-action reader-menu-action-primary"
                          onClick={() => {
                            setActiveModal("import");
                            setReaderDropdown(null);
                          }}
                        >
                          <Upload className="h-4 w-4" />
                          新增引用素材
                        </button>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </header>

          <div className={isContentWorkspace ? "wechat-layout" : "reader-layout reader-layout-reading"}>
            {isContentWorkspace ? (
              <section className="wechat-workspace" aria-label={`${localArticleCollectionLabel(activeContentChannel)}工作台`}>
                {activeWorkspace === "wechat" ? (
                  <div className="panel wechat-generate-panel">
                    <div className="panel-title">
                      <FileText className="h-4 w-4 text-[var(--red)]" />
                      公众号生成
                    </div>
                    <div className="wechat-source-card">
                      <div className="kicker">当前引用素材</div>
                      <div className="wechat-source-title">{selectedArticle?.title ?? "先在左侧选择一篇素材"}</div>
                      {selectedArticle ? (
                        <div className="tiny-meta">
                          {selectedArticle.sourceName} · {articleCategory(selectedArticle)}
                        </div>
                      ) : (
                        <p className="panel-copy">外部引用素材只作为生成参考，这里不展示素材阅读页。</p>
                      )}
                    </div>
                    <WeChatAgentOverview
                      draftImageAssets={draftImageAssets}
                      latestDraft={latestDraft}
                      referenceCount={selectedReferenceArticles.length}
                      selectedArticle={selectedArticle}
                      selectedBlueprint={selectedBlueprint}
                      selectedStructureRun={selectedStructureRun}
                      structureAssetCount={referenceStructureRuns.length}
                    />
                    <WritingStructureAssetPanel
                      busy={busy}
                      isReference={Boolean(selectedArticle && referenceArticleSet.has(selectedArticle.id))}
                      onAnalyze={handleWritingStructure}
                      onReferenceToggle={() => selectedArticle && toggleReferenceArticle(selectedArticle.id)}
                      selectedArticle={selectedArticle}
                      structureRun={selectedStructureRun}
                    />
                    <form className="wechat-writing-form" onSubmit={handleOriginalDraft}>
                      <label className="field-label" htmlFor="writing-topic">
                        原创选题
                      </label>
                      <input
                        id="writing-topic"
                        className="field"
                        value={writingTopic}
                        onChange={(event) => setWritingTopic(event.target.value)}
                        placeholder="例如：想转 Agent 工程师，先补齐哪些工程能力？"
                      />
                      <label className="field-label" htmlFor="writing-blueprint">
                        写作蓝图
                      </label>
                      <select
                        id="writing-blueprint"
                        className="field"
                        value={selectedBlueprintId}
                        onChange={(event) => setSelectedBlueprintId(event.target.value)}
                      >
                        <option value="">默认结构</option>
                        {writingBlueprints.map((blueprint) => (
                          <option key={blueprint.id} value={blueprint.id}>
                            {blueprint.name}
                          </option>
                        ))}
                      </select>
                      <WritingBlueprintPreview
                        blueprint={selectedBlueprint}
                        referenceCount={selectedReferenceArticles.length}
                        structureAssetCount={referenceStructureRuns.length}
                        onGenerate={handleWritingBlueprint}
                        busy={busy}
                      />
                      <div className="metric-line">
                        <span className="field-label">参考素材</span>
                        <span className="tiny-meta">
                          已选 {selectedReferenceArticles.length} 篇 · 可用结构资产 {referenceStructureRuns.length} 条
                        </span>
                      </div>
                      <div className="wechat-reference-list" aria-label="参考素材">
                        {articles.map((article) => (
                          <label key={article.id} className="wechat-reference-option">
                            <input
                              type="checkbox"
                              checked={referenceArticleSet.has(article.id)}
                              onChange={() => toggleReferenceArticle(article.id)}
                            />
                            <span>{article.title}</span>
                          </label>
                        ))}
                      </div>
                      <button
                        type="submit"
                        disabled={busy === "writing-draft" || referenceArticleIds.length === 0 || !writingTopic.trim()}
                        className="btn btn-primary"
                      >
                        {busy === "writing-draft" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        生成微信公众号原创稿
                      </button>
                    </form>
                    <button
                      type="button"
                      disabled={!selectedArticle || busy === "professional-draft"}
                      onClick={handleProfessionalDraft}
                      className="btn btn-redline wechat-generate-button"
                    >
                      {busy === "professional-draft" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      生成专业长文 + 配图
                    </button>
                    <section className="panel">
                      <div className="panel-title">
                        <FileText className="h-4 w-4 text-[var(--green)]" />
                        最新草稿
                      </div>
                      {latestDraft ? (
                        <div className="draft-card">
                          <div className="draft-title">{latestDraft.title}</div>
                          <p className="wechat-draft-preview">{stripPreviewHtml(latestDraft.body).slice(0, 220)}</p>
                          {sourceReuseWarnings.length > 0 ? (
                            <div className="mt-3 warning-list">
                              <div className="tiny-meta text-[var(--amber)]">疑似长句复用，需要人工改写</div>
                              {sourceReuseWarnings.map((warning) => (
                                <p key={`${warning.sourceArticleId}-${warning.matchedText}`} className="tiny-meta">
                                  {warning.sourceTitle}：{warning.matchedText.slice(0, 80)}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className="panel-copy">生成后会在这里看到公众号草稿。</p>
                      )}
                    </section>
                  </div>
                ) : null}
                <ContentDraftWorkbench
                  busy={busy}
                  channel={activeContentChannel}
                  draftEditor={draftEditor}
                  drafts={pendingChannelDrafts}
                  onCreateBlank={handleCreateBlankDraft}
                  onEditorChange={(patch) => setDraftEditor((current) => ({ ...current, ...patch }))}
                  onMove={handleDraftReorder}
                  onSave={handleDraftEditorSave}
                  onSelect={handleDraftSelect}
                  onStatusChange={handleDraftStatusChange}
                  selectedDraft={selectedLocalDraft}
                  stats={channelStats}
                />
              </section>
            ) : (
              <article className="reader-card">
                {selectedArticle ? (
                  <div className="reader-body">
                    <ReadableContent content={selectedArticle.contentHtml || selectedArticle.contentText} />
                  </div>
                ) : (
                  <div className="empty-reader">当前筛选没有选中引用素材</div>
                )}
              </article>
            )}
          </div>
        </section>

      </div>

      <datalist id="article-category-options">
        {categoryOptions.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>

      {activeModal === "analysis" ? (
        <ModalShell title="AI 拆解" icon={<Brain className="h-5 w-5 text-[var(--amber)]" />} onClose={() => setActiveModal(null)} wide>
          <div className="modal-stack">
            <section className="panel">
              <div className="panel-title">
                <Brain className="h-4 w-4 text-[var(--amber)]" />
                AI 拆解
              </div>
              <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} className="field mb-3">
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <button type="button" disabled={!selectedArticle || busy === "analyze"} onClick={handleAnalyze} className="btn btn-primary">
                {busy === "analyze" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                生成拆解
              </button>
            </section>

            <section className="panel">
              <div className="panel-title">
                <FileText className="h-4 w-4 text-[var(--green)]" />
                候选角度
              </div>
              <div className="grid gap-3">
                {selectedAnalysisRuns.flatMap((run) =>
                  run.topicCandidates.map((candidate) => (
                    <div key={candidate.id ?? candidate.title} className="angle-card">
                      <div className="angle-card-title">{candidate.title}</div>
                      <p className="mt-2 tiny-meta">{candidate.hook}</p>
                      <div className="metric-line mt-3">
                        <span>{candidate.angle}</span>
                        <span className="score">{candidate.viralScore}</span>
                      </div>
                    </div>
                  )),
                )}
                {selectedAnalysisRuns.length === 0 ? <p className="panel-copy">等待第一条拆解结果</p> : null}
              </div>
            </section>

            <section className="panel">
              <div className="panel-title">
                <Settings className="h-4 w-4 text-[var(--blue)]" />
                高级处理
              </div>
              <button type="button" disabled={!selectedArticle || busy === "agent"} onClick={handleAgent} className="btn btn-secondary">
                {busy === "agent" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                运行高级处理
              </button>
              {selectedAgentRuns[0] ? (
                <div className="mt-3 grid gap-2">
                  <div className="metric-line">
                    <span>{selectedAgentRuns[0].articleType}</span>
                    <span className="score">{selectedAgentRuns[0].qualityScore}</span>
                  </div>
                  <p className="panel-copy">{selectedAgentRuns[0].reasoningSummary}</p>
                  <p className="tiny-meta">推荐模板：{selectedAgentRuns[0].recommendedTemplateIds.join("、") || "待补充"}</p>
                </div>
              ) : (
                <p className="mt-3 panel-copy">暂无高级处理记录</p>
              )}
            </section>
          </div>
        </ModalShell>
      ) : null}

      {activeModal === "manage" ? (
        <ModalShell title="引用素材管理" icon={<Settings className="h-5 w-5 text-[var(--blue)]" />} onClose={() => setActiveModal(null)} wide>
          <section className="manage-panel">
            <div className="manage-summary">
              <div>
                <div className="panel-title mb-1">后台管理</div>
                <p className="panel-copy">集中新增、查看、编辑、分类和删除外部引用素材；分类可以手动改，也可以按标题、标签和正文智能建议。</p>
              </div>
              <div className="manage-summary-actions">
                <button type="button" className="btn btn-primary manage-bulk-button" onClick={() => setActiveModal("import")}>
                  <Upload className="h-4 w-4" />
                  新增引用素材
                </button>
                <button type="button" className="btn btn-secondary manage-bulk-button" onClick={handleBulkSuggestCategories} disabled={busy === "category-bulk"}>
                  {busy === "category-bulk" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  全部智能分类
                </button>
              </div>
            </div>

            <div className="manage-category-row" aria-label="分类概览">
              {[ALL_CATEGORIES, ...categoryOptions].map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`manage-category-chip ${manageCategoryFilter === category ? "manage-category-chip-active" : ""}`}
                  onClick={() => setManageCategoryFilter(category)}
                >
                  <span>{category}</span>
                  <span>{category === ALL_CATEGORIES ? articles.length : categoryCounts.get(category) ?? 0}</span>
                </button>
              ))}
            </div>

            <div className="management-toolbar">
              <label className="field-wrap block">
                <Search className="field-icon" />
                <input
                  value={manageQuery}
                  onChange={(event) => setManageQuery(event.target.value)}
                  placeholder="管理中搜索素材标题、来源、标签、正文"
                  className="field field-with-icon"
                />
              </label>
              <div className="management-result-count">
                显示 {managedArticles.length} / {articles.length} 篇外部素材
              </div>
            </div>

            <div className="article-management-list">
              {managedArticles.map((article) => (
                <form
                  key={`${article.id}-${articleCategory(article)}`}
                  className="article-management-row"
	                  onSubmit={(event) => {
	                    event.preventDefault();
	                    const form = new FormData(event.currentTarget);
	                    void handleArticleMetaSave(article, {
	                      category: String(form.get("category") ?? ""),
	                      sourceProject: String(form.get("sourceProject") ?? ""),
	                    });
	                  }}
                >
                  <div className="management-title-block">
                    <div className="management-title">{article.title}</div>
                    <div className="tiny-meta">
	                      {article.sourceName} · {article.publishedAt || "未标日期"}
	                    </div>
	                  </div>
                  <button
                    type="button"
                    className={`btn btn-secondary management-action management-favorite-action ${
                      isArticleFavorite(article) ? "favorite-action-active" : ""
                    }`}
                    disabled={busy === `favorite-${article.id}`}
                    onClick={() => void handleFavoriteToggle(article)}
                  >
                    <Star className="h-4 w-4" />
                    <span>{isArticleFavorite(article) ? "已收藏" : "收藏"}</span>
                  </button>
	                  <input name="category" list="article-category-options" defaultValue={articleCategory(article)} className="field management-category-input" />
	                  <input name="sourceProject" defaultValue={articleSourceProject(article)} className="field management-project-input" />
	                  <button type="button" className="btn btn-secondary management-action" onClick={() => void handleSuggestedCategorySave(article)}>
                    <Sparkles className="h-4 w-4" />
                    <span>智能分类</span>
                  </button>
                  <button type="button" className="btn btn-secondary management-action" onClick={() => openEditModal(article)}>
                    <Pencil className="h-4 w-4" />
                    <span>编辑</span>
                  </button>
                  <button type="submit" className="btn btn-primary management-action" disabled={busy === `category-${article.id}`}>
                    <Save className="h-4 w-4" />
                    <span>保存</span>
                  </button>
                  <button
                    type="button"
                    className={`btn btn-danger management-action ${pendingDeleteId === article.id ? "management-delete-pending" : ""}`}
                    disabled={busy === `delete-${article.id}`}
                    onClick={() => void handleDeleteArticle(article)}
                  >
                    {busy === `delete-${article.id}` ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    <span>{pendingDeleteId === article.id ? "确认删除" : "删除"}</span>
                  </button>
                </form>
              ))}
              {managedArticles.length === 0 ? (
                <div className="empty-list">
                  <div className="empty-list-title">没有匹配素材</div>
                  <p>调整管理搜索或分类条件。</p>
                </div>
              ) : null}
            </div>
          </section>
        </ModalShell>
      ) : null}

      {activeModal === "edit" ? (
        <ModalShell title="编辑素材正文" icon={<Pencil className="h-5 w-5 text-[var(--green)]" />} onClose={() => setActiveModal(null)} wide>
          <form className="editor-form" onSubmit={handleArticleEdit}>
            <label className="field-label" htmlFor="article-edit-title">
              标题
            </label>
            <input
              id="article-edit-title"
              value={editDraft.title}
              onChange={(event) => {
                const title = event.currentTarget.value;
                setEditDraft((current) => ({ ...current, title }));
              }}
              className={inputClassName}
            />

            <label className="field-label" htmlFor="article-edit-category">
              分类
            </label>
            <input
              id="article-edit-category"
              list="article-category-options"
              value={editDraft.category}
              onChange={(event) => {
                const category = event.currentTarget.value;
                setEditDraft((current) => ({ ...current, category }));
              }}
              className={inputClassName}
            />

            <label className="field-label" htmlFor="article-edit-source-project">
              项目来源
            </label>
            <input
              id="article-edit-source-project"
              value={editDraft.sourceProject}
              onChange={(event) => {
                const sourceProject = event.currentTarget.value;
                setEditDraft((current) => ({ ...current, sourceProject }));
              }}
              className={inputClassName}
            />

            <div className="editor-toolbar">
              <label className="field-label" htmlFor="article-edit-content">
                正文
              </label>
              <button type="button" className={secondaryButtonClassName} onClick={handleAutoCleanEditDraft}>
                <Scissors className="h-4 w-4" />
                自动裁剪杂项
              </button>
            </div>
            <div
              id="article-edit-content"
              key={`${activeModal}-${selectedArticle?.id ?? "article"}`}
              ref={editorRef}
              role="textbox"
              aria-label="正文"
              aria-multiline="true"
              contentEditable
              suppressContentEditableWarning
              onInput={(event) => {
                const content = event.currentTarget.innerHTML;
                setEditDraft((current) => ({ ...current, content }));
              }}
              className={`${textareaClassName} article-editor-textarea`}
              dangerouslySetInnerHTML={{ __html: editDraft.content }}
            />
            <div className="editor-actions">
              <button type="button" className={secondaryButtonClassName} onClick={() => setActiveModal(null)}>
                取消
              </button>
              <button type="submit" className={primaryButtonClassName} disabled={busy === "article-edit"}>
                <Save className="h-4 w-4" />
                保存正文
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {activeModal === "import" ? (
        <ModalShell title="新增引用素材" icon={<Upload className="h-5 w-5 text-[var(--green)]" />} onClose={() => setActiveModal(null)}>
          <section className="add-article-panel">
            <div className="import-mode-switch" aria-label="新增引用素材方式">
              <button type="button" onClick={() => setImportMode("url")} className={importModeButtonClassName(importMode === "url")}>
                链接导入
              </button>
              <button type="button" onClick={() => setImportMode("manual")} className={importModeButtonClassName(importMode === "manual")}>
                手动粘贴
              </button>
            </div>

            {importMode === "url" ? (
              <form className="grid gap-2" onSubmit={handleUrlImport}>
                <input name="sourceProject" placeholder="项目来源，例如 Harness 专题 / Agent 转型资料" className={inputClassName} />
                <input name="url" required placeholder="粘贴外部文章链接后解析" className={inputClassName} />
                <button type="submit" className={primaryButtonClassName} disabled={busy === "url-import"}>
                  <RefreshCw className={`h-4 w-4 ${busy === "url-import" ? "animate-spin" : ""}`} />
                  链接解析
                </button>
              </form>
            ) : (
              <form className="grid gap-2" onSubmit={handleManualImport}>
                <input name="title" required placeholder="标题" className={inputClassName} />
                <input name="sourceName" required placeholder="来源名称" className={inputClassName} />
                <input name="sourceProject" placeholder="项目来源，例如 Harness 专题 / AI Agent 竞品" className={inputClassName} />
                <input name="originalUrl" placeholder="原文链接" className={inputClassName} />
                <input name="category" list="article-category-options" placeholder="分类，例如 AI Agent / Infra / 期货" className={inputClassName} />
                <div className="grid grid-cols-2 gap-2">
                  <input name="author" placeholder="作者" className={inputClassName} />
                  <input name="publishedAt" type="date" className={inputClassName} />
                </div>
                <input name="tags" placeholder="标签，用逗号分隔" className={inputClassName} />
                <textarea name="contentText" required placeholder="正文" rows={7} className={textareaClassName} />
                <button type="submit" className={primaryButtonClassName} disabled={busy === "manual-import"}>
                  <Save className="h-4 w-4" />
                  保存到引用素材库
                </button>
              </form>
            )}

            {importFeedback ? <ImportFeedback notice={importFeedback} /> : null}
            <p className="panel-copy mt-3">链接解析失败时，切到手动粘贴补全文字段后仍可保存到引用素材库。</p>
          </section>
        </ModalShell>
      ) : null}
    </main>
  );
}

function ContentDraftWorkbench({
  busy,
  channel,
  draftEditor,
  drafts,
  onCreateBlank,
  onEditorChange,
  onMove,
  onSave,
  onSelect,
  onStatusChange,
  selectedDraft,
  stats,
}: {
  busy: string | null;
  channel: ContentChannel;
  draftEditor: DraftEditorState;
  drafts: LocalDraft[];
  onCreateBlank: () => void;
  onEditorChange: (patch: Partial<DraftEditorState>) => void;
  onMove: (draft: LocalDraft, direction: -1 | 1) => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onSelect: (draftId: string) => void;
  onStatusChange: (draft: LocalDraft, status: PublishStatus) => void | Promise<void>;
  selectedDraft: LocalDraft | null;
  stats: Record<PublishStatus, number>;
}) {
  const label = channelLabel(channel);
  const selectedStatus = selectedDraft ? draftStatus(selectedDraft) : "draft";

  return (
    <section className="panel content-draft-workbench" aria-label={`${label}待提交草稿工作台`}>
      <div className="content-draft-heading">
        <div>
          <div className="panel-title">
            <FileText className="h-4 w-4 text-[var(--blue)]" />
            {label}草稿工作台
          </div>
          <p className="panel-copy">
            这里只显示待提交草稿：草稿 {stats.draft ?? 0} 篇 · 待发布 {stats.queued ?? 0} 篇。正文可以直接在右侧编辑保存。
          </p>
        </div>
        <button type="button" className="btn btn-secondary content-create-button" disabled={busy === "draft-create"} onClick={onCreateBlank}>
          {busy === "draft-create" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
          新建空白草稿
        </button>
      </div>

      <div className="content-draft-shell">
        <div className="content-draft-list" aria-label="待提交草稿文件">
          {drafts.map((draft, index) => (
            <article key={draft.id} className={`content-draft-item ${selectedDraft?.id === draft.id ? "content-draft-item-active" : ""}`}>
              <div className="content-order-controls" aria-label="调整发布顺序">
                <button type="button" className="content-order-button" disabled={index === 0 || busy === `draft-order-${draft.id}`} onClick={() => void onMove(draft, -1)}>
                  ↑
                </button>
                <span>{draft.queueOrder ?? index + 1}</span>
                <button
                  type="button"
                  className="content-order-button"
                  disabled={index === drafts.length - 1 || busy === `draft-order-${draft.id}`}
                  onClick={() => void onMove(draft, 1)}
                >
                  ↓
                </button>
              </div>
              <button type="button" className="content-draft-item-main" aria-pressed={selectedDraft?.id === draft.id} onClick={() => onSelect(draft.id)}>
                <span className="content-queue-title">{draft.title}</span>
                <span className="content-queue-preview">{stripPreviewHtml(draft.body).slice(0, 160) || "暂无正文"}</span>
                <span className="content-queue-meta">
                  <span>{publishStatusLabel(draftStatus(draft))}</span>
                  <span>{draft.plannedPublishAt ? `计划 ${formatDateTime(draft.plannedPublishAt)}` : "未排期"}</span>
                </span>
              </button>
            </article>
          ))}
          {drafts.length === 0 ? (
            <div className="empty-list">
              <div className="empty-list-title">没有待提交草稿</div>
              <p>已发布和归档文章会从这里隐藏；可以新建空白草稿继续整理。</p>
            </div>
          ) : null}
        </div>

        <div className="content-draft-editor" aria-label="草稿正文编辑区">
          {selectedDraft ? (
            <>
              <div className="content-draft-editor-top">
                <label className="field-label" htmlFor="draft-editor-title">
                  标题
                </label>
                <input
                  id="draft-editor-title"
                  className="field"
                  value={draftEditor.title}
                  onChange={(event) => onEditorChange({ title: event.target.value })}
                />
              </div>

              <div className="content-draft-controls">
                <label className="field-label" htmlFor="draft-editor-status">
                  状态
                </label>
                <select
                  id="draft-editor-status"
                  className="field"
                  value={draftEditor.publishStatus}
                  disabled={busy === `draft-status-${selectedDraft.id}`}
                  onChange={(event) => onEditorChange({ publishStatus: event.target.value as PublishStatus })}
                >
                  <option value="draft">草稿</option>
                  <option value="queued">待发布</option>
                </select>
                <label className="field-label" htmlFor="draft-editor-plan">
                  计划发布时间
                </label>
                <input
                  id="draft-editor-plan"
                  type="datetime-local"
                  className="field"
                  value={draftEditor.plannedPublishAt}
                  onChange={(event) => onEditorChange({ plannedPublishAt: event.target.value })}
                />
              </div>

              <label className="field-label" htmlFor="draft-editor-body">
                正文
              </label>
              <textarea
                id="draft-editor-body"
                className="textarea content-draft-body-field"
                value={draftEditor.body}
                onChange={(event) => onEditorChange({ body: event.target.value })}
              />

              <label className="field-label" htmlFor="draft-editor-notes">
                备注
              </label>
              <textarea
                id="draft-editor-notes"
                className="textarea content-draft-notes-field"
                value={draftEditor.notes}
                onChange={(event) => onEditorChange({ notes: event.target.value })}
              />

              <div className="content-draft-editor-actions">
                <button type="button" className="btn btn-primary" disabled={busy === `draft-edit-${selectedDraft.id}`} onClick={() => void onSave()}>
                  {busy === `draft-edit-${selectedDraft.id}` ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存草稿
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy === `draft-status-${selectedDraft.id}`}
                  onClick={() => void onStatusChange(selectedDraft, "published")}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  标为已发布
                </button>
              </div>

              <section className="content-draft-preview-panel" aria-label="正文预览">
                <div className="metric-line">
                  <span className="field-label">正文预览</span>
                  <span className="tiny-meta">{publishStatusLabel(selectedStatus)} · {stripPreviewHtml(draftEditor.body).length} 字</span>
                </div>
                <div className="content-draft-readable">
                  <ReadableContent content={draftEditor.body || "暂无正文"} />
                </div>
              </section>
            </>
          ) : (
            <div className="empty-list">
              <div className="empty-list-title">请选择一个草稿</div>
              <p>左侧会列出所有待提交的{label}草稿，点开后可以编辑标题、正文和排期。</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function WeChatAgentOverview({
  draftImageAssets,
  latestDraft,
  referenceCount,
  selectedArticle,
  selectedBlueprint,
  selectedStructureRun,
  structureAssetCount,
}: {
  draftImageAssets: DraftImageAsset[];
  latestDraft: LocalDraft | null;
  referenceCount: number;
  selectedArticle: Article | null;
  selectedBlueprint: WritingBlueprint | null;
  selectedStructureRun: WritingStructureRun | null;
  structureAssetCount: number;
}) {
  const generatedImageCount = draftImageAssets.filter((asset) => asset.status === "generated").length;
  const failedImageCount = draftImageAssets.filter((asset) => asset.status === "failed").length;

  return (
    <section className="wechat-agent-overview" aria-label="公众号 Agent 流程">
      <div className="wechat-section-heading">
        <div>
          <div className="kicker">AGENT PIPELINE</div>
          <h2>公众号 Agent 工作流</h2>
        </div>
        <span className="tiny-meta">素材 → 结构 → 蓝图 → 草稿 → 配图</span>
      </div>
      <div className="wechat-agent-grid">
        <AgentStatusCard
          icon={<Scissors className="h-4 w-4" />}
          name="结构拆解 Agent"
          status={selectedStructureRun ? `已拆解 · ${selectedStructureRun.qualityScore} 分` : selectedArticle ? "待拆解" : "先选素材"}
          copy={selectedStructureRun?.structure.titlePattern || "提取标题套路、开头钩子、技术骨架和不要学的表达。"}
          tone={selectedStructureRun ? "ready" : "idle"}
        />
        <AgentStatusCard
          icon={<Brain className="h-4 w-4" />}
          name="写作蓝图 Agent"
          status={selectedBlueprint ? "蓝图已选" : referenceCount > 0 ? "可生成蓝图" : "先选参考"}
          copy={selectedBlueprint?.name || `${referenceCount} 篇参考，${structureAssetCount} 条结构资产可用。`}
          tone={selectedBlueprint ? "ready" : "idle"}
        />
        <AgentStatusCard
          icon={<Sparkles className="h-4 w-4" />}
          name="原创写作 Agent"
          status={latestDraft && draftImageAssets.length === 0 ? "已有原创草稿" : "等待选题"}
          copy={latestDraft?.title || "根据选题和参考结构写原创草稿，并检查长句复用。"}
          tone={latestDraft && draftImageAssets.length === 0 ? "ready" : "idle"}
        />
        <AgentStatusCard
          icon={<Upload className="h-4 w-4" />}
          name="专业长文配图 Agent"
          status={draftImageAssets.length > 0 ? `${generatedImageCount} 张成功 · ${failedImageCount} 张待处理` : "可一键生成"}
          copy="基于当前素材生成专业长文、封面图和解释图。"
          tone={draftImageAssets.length > 0 ? "ready" : "idle"}
        />
      </div>
    </section>
  );
}

function AgentStatusCard({
  copy,
  icon,
  name,
  status,
  tone,
}: {
  copy: string;
  icon: ReactNode;
  name: string;
  status: string;
  tone: "ready" | "idle";
}) {
  return (
    <div className="agent-status-card">
      <div className="agent-status-card-top">
        <span className="agent-status-icon">{icon}</span>
        <span className={tone === "ready" ? "agent-status-pill agent-status-pill-ready" : "agent-status-pill"}>{status}</span>
      </div>
      <div className="agent-status-name">{name}</div>
      <p>{copy}</p>
    </div>
  );
}

function WritingStructureAssetPanel({
  busy,
  isReference,
  onAnalyze,
  onReferenceToggle,
  selectedArticle,
  structureRun,
}: {
  busy: string | null;
  isReference: boolean;
  onAnalyze: () => void;
  onReferenceToggle: () => void;
  selectedArticle: Article | null;
  structureRun: WritingStructureRun | null;
}) {
  const structure = structureRun?.structure;

  return (
    <section className="writing-asset-panel" aria-label="写作结构资产">
      <div className="wechat-section-heading">
        <div>
          <div className="kicker">STRUCTURE ASSET</div>
          <h2>拆解结果</h2>
        </div>
        <span className={structureRun ? "score" : "tiny-meta"}>{structureRun ? `${structureRun.qualityScore} 分` : "未生成"}</span>
      </div>

      {structure ? (
        <div className="structure-asset-grid">
          <StructureField label="标题套路" value={structure.titlePattern} />
          <StructureField label="开头钩子" value={structure.openingHook} />
          <StructureField label="问题压力" value={structure.pressurePoint} />
          <StructureField label="克制改写" value={structure.ethicalRewrite} />
          <StructureList label="技术骨架" values={structure.technicalBackbone} />
          <StructureList label="证据方式" values={structure.evidencePattern} />
          <StructureField label="段落节奏" value={structure.pacingPattern} />
          <StructureList label="可复用写法" values={structure.reusableMoves} />
          <StructureList label="不要学" values={structure.antiPatterns} warning />
        </div>
      ) : (
        <div className="structure-empty-state">
          <p className="panel-copy">
            点“拆解当前素材结构”后，会在这里看到标题套路、开头钩子、技术骨架、可复用写法和不要学的表达。
          </p>
        </div>
      )}

      <div className="wechat-action-row">
        <button type="button" disabled={!selectedArticle || busy === "writing-structure"} onClick={onAnalyze} className="btn btn-secondary">
          {busy === "writing-structure" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
          {structureRun ? "重新拆解当前素材结构" : "拆解当前素材结构"}
        </button>
        <button type="button" disabled={!selectedArticle} onClick={onReferenceToggle} className="btn btn-secondary">
          <CheckCircle2 className="h-4 w-4" />
          {isReference ? "移出参考素材" : "加入参考素材"}
        </button>
      </div>
      {structureRun ? <p className="tiny-meta">最近拆解：{formatStructureRunDate(structureRun)}</p> : null}
    </section>
  );
}

function StructureField({ label, value }: { label: string; value: string }) {
  return (
    <div className="structure-field">
      <span>{label}</span>
      <p>{value || "未提取"}</p>
    </div>
  );
}

function StructureList({ label, values, warning = false }: { label: string; values: string[]; warning?: boolean }) {
  const items = values.length > 0 ? values : ["未提取"];
  return (
    <div className={warning ? "structure-field structure-field-warning" : "structure-field"}>
      <span>{label}</span>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function WritingBlueprintPreview({
  blueprint,
  busy,
  onGenerate,
  referenceCount,
  structureAssetCount,
}: {
  blueprint: WritingBlueprint | null;
  busy: string | null;
  onGenerate: () => void;
  referenceCount: number;
  structureAssetCount: number;
}) {
  return (
    <section className="blueprint-preview" aria-label="写作蓝图预览">
      <div className="metric-line">
        <span className="field-label">蓝图状态</span>
        <span className="tiny-meta">
          {referenceCount} 篇参考 · {structureAssetCount} 条结构资产
        </span>
      </div>
      {blueprint ? (
        <div className="blueprint-card">
          <div className="draft-title">{blueprint.name}</div>
          <p className="panel-copy">{blueprint.summary || "已生成可复用写作蓝图。"}</p>
          <div className="blueprint-section-list">
            {blueprint.sectionPlan.slice(0, 4).map((section) => (
              <span key={`${blueprint.id}-${section.title}`}>{section.title}</span>
            ))}
          </div>
        </div>
      ) : (
        <p className="panel-copy">没有选择蓝图时会使用默认结构；也可以先用参考素材生成专属蓝图。</p>
      )}
      <button type="button" disabled={referenceCount === 0 || busy === "writing-blueprint"} onClick={onGenerate} className="btn btn-secondary">
        {busy === "writing-blueprint" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
        用所选素材生成结构蓝图
      </button>
    </section>
  );
}

function ArticleLibraryPanel({
  articles,
  busy,
  libraryResults,
  onArticleSelect,
  onClose,
  onFavoriteToggle,
  query,
  selectedArticleId,
  sortMode,
  updateQuery,
}: {
  articles: Article[];
  busy: string | null;
  libraryResults: LibraryResult[];
  onArticleSelect: (articleId: string) => void;
  onClose: () => void;
  onFavoriteToggle: (article: Article) => void | Promise<void>;
  query: string;
  selectedArticleId: string;
  sortMode: SortMode;
  updateQuery: (value: string) => void;
}) {
  return (
    <aside
      className="library-rail"
    >
      <div className="rail-search">
        <div className="rail-search-row">
          <label className="field-wrap block rail-search-field">
            <Search className="field-icon" />
            <input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="搜索素材标题、来源、标签、正文" className="field field-with-icon" />
          </label>
          <button type="button" className="rail-collapse-button" aria-label="收回左侧素材栏" onClick={onClose}>
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        <div className="rail-search-footer">
          <span>
            显示 {libraryResults.length} / {articles.length} 篇
          </span>
        </div>
      </div>

      <div className="article-list-header">
        <span>外部引用素材</span>
        <span>{sortMode === "relevance" && query.trim() ? "按相关度" : "按时间"}</span>
      </div>

      <div className="article-list">
        {libraryResults.map(({ article }) => (
          <div
            key={article.id}
            className={`article-row ${article.id === selectedArticleId ? "article-row-active" : ""} ${isArticleFavorite(article) ? "article-row-starred" : ""}`}
          >
            <button type="button" aria-label={`打开引用素材：${article.title}`} onClick={() => onArticleSelect(article.id)} className="article-row-main">
              <div className="article-row-top">
                <span className="category-chip">{articleCategory(article)}</span>
                <span className="tiny-meta">{formatArticleDate(article)}</span>
              </div>
              <div className="article-row-title">{article.title}</div>
              <div className="article-row-meta">
                <span className="truncate">
                  {articleSourceProject(article)} · {sourceTypeLabel(article.sourceType)}
                </span>
                <span>{articleWordCount(article)} 字</span>
              </div>
            </button>
            <button
              type="button"
              className={`favorite-toggle article-row-favorite ${isArticleFavorite(article) ? "favorite-toggle-active" : ""}`}
              aria-label={isArticleFavorite(article) ? `取消特别收藏：${article.title}` : `特别收藏：${article.title}`}
              disabled={busy === `favorite-${article.id}`}
              onClick={() => void onFavoriteToggle(article)}
            >
              <Star className="h-4 w-4" />
            </button>
          </div>
        ))}
        {libraryResults.length === 0 ? (
          <div className="empty-list">
            <div className="empty-list-title">没有匹配素材</div>
            <p>换一个关键词，或清除来源和分类条件。</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function ModalShell({
  title,
  icon,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  icon: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const titleId =
    title === "AI 拆解"
      ? "modal-title-analysis"
      : title === "编辑素材正文"
        ? "modal-title-edit"
        : title === "引用素材管理"
          ? "modal-title-manage"
          : "modal-title-import";

  return (
    <div className="modal-backdrop">
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className={`modal-card ${wide ? "modal-card-wide" : ""}`}>
        <header className="modal-header">
          <div className="modal-title-wrap">
            {icon}
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
          </div>
          <button type="button" aria-label="关闭" className="modal-close" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

function ImportFeedback({ notice }: { notice: Notice }) {
  return (
    <div className={`import-feedback import-feedback-${notice.type}`}>
      {notice.type === "error" ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
      <span>{notice.text}</span>
    </div>
  );
}

function StatusBadge({ notice }: { notice: Notice }) {
  const Icon = notice.type === "ok" ? CheckCircle2 : notice.type === "error" ? AlertTriangle : Sparkles;
  return (
    <div className={`status-badge status-${notice.type}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{notice.text}</span>
    </div>
  );
}

function editableHtmlFromArticle(article: Article): string {
  const contentHtml = article.contentHtml.trim();
  if (/<[a-z][\s\S]*>/i.test(contentHtml)) {
    return contentHtml;
  }
  const contentText = article.contentText.trim();
  if (contentText) {
    return textToEditableHtml(contentText);
  }
  return /<[a-z][\s\S]*>/i.test(article.content) ? article.content : textToEditableHtml(contentHtml || article.content);
}

function textToEditableHtml(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtmlText(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function ReadableContent({ content }: { content: string }) {
  if (/<[a-z][\s\S]*>/i.test(content)) {
    return <div className="article-html" dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(content) }} />;
  }
  return (
    <>
      {content.split(/\n{2,}/).map((paragraph, index) => (
        <p key={`${paragraph.slice(0, 16)}-${index}`}>{paragraph}</p>
      ))}
    </>
  );
}

function autoCleanEditableContent(content: string): string {
  return /<[a-z][\s\S]*>/i.test(content) ? autoCleanEditableHtml(content) : autoCleanEditableText(content);
}

function autoCleanEditableHtml(content: string): string {
  return cropEditableTailMarker(dropEditableLeadingBlocks(content)).trim();
}

function dropEditableLeadingBlocks(content: string): string {
  let result = content.trim();
  for (let index = 0; index < 5; index += 1) {
    const match = result.match(/^\s*<(p|section|div|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/i);
    if (!match || !isEditableLeadingBoilerplate(match[2])) {
      break;
    }
    result = result.slice(match[0].length).trim();
  }
  return result;
}

function cropEditableTailMarker(content: string): string {
  const marker = findEditableTailMarker(content);
  if (marker?.index == null || marker.index < Math.min(160, content.length * 0.25)) {
    return content;
  }

  const lowerContent = content.toLowerCase();
  const blockStart = ["<p", "<section", "<div", "<blockquote"].reduce((nearest, token) => {
    const position = lowerContent.lastIndexOf(token, marker.index);
    return position > nearest ? position : nearest;
  }, -1);
  return content.slice(0, blockStart >= 0 ? blockStart : marker.index);
}

function autoCleanEditableText(content: string): string {
  let lines = content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = 0; index < 5 && lines.length > 0; index += 1) {
    if (!isEditableLeadingBoilerplate(lines[0])) {
      break;
    }
    lines = lines.slice(1);
  }

  const tailIndex = lines.findIndex((line, index) => index > Math.min(2, lines.length * 0.25) && isEditableTailMarkerLine(line));
  if (tailIndex >= 0) {
    lines = lines.slice(0, tailIndex);
  }

  return lines.join("\n\n").trim();
}

function isEditableLeadingBoilerplate(content: string): boolean {
  const text = htmlTextContent(content);
  return text.length <= 120 && /(发自|公众号|作者|来源|编辑|出品|量子位|qbitai)/i.test(text);
}

function htmlTextContent(value: string): string {
  return decodeHtmlAttribute(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

function findEditableTailMarker(content: string): RegExpMatchArray | null {
  return (
    content.match(EDITABLE_TAIL_MARKER_PATTERN) ??
    content.match(EDITABLE_ENGAGEMENT_TAIL_MARKER_PATTERN) ??
    content.match(EDITABLE_END_TAIL_MARKER_PATTERN)
  );
}

function isEditableTailMarkerLine(line: string): boolean {
  const text = line.trim();
  return (
    EDITABLE_TAIL_MARKER_PATTERN.test(text) ||
    EDITABLE_ENGAGEMENT_TAIL_MARKER_PATTERN.test(text) ||
    EDITABLE_END_TAIL_MARKER_PATTERN.test(text)
  );
}

function sanitizeArticleHtml(content: string): string {
  return content
    .replace(/<\s*(script|style|iframe|video|audio|canvas|form|button|input|textarea|select|svg)\b[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|video|audio|canvas|form|button|input|textarea|select|svg)\b[^>]*\/?>/gi, "")
    .replace(/<img\b[^>]*>/gi, sanitizeImageTag)
    .replace(/\s(?:style|class|id|width|height|align|color|bgcolor|face|size|role|tabindex)=("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:data-[\w-]+|aria-[\w-]+)=("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<([a-z0-9]+)\b[^>]*>\s*(?:https?:\/\/|www\.)[^<\s]+\/?\s*<\/\1>/gi, "")
    .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, "</p><p>")
    .replace(/<p\b[^>]*>\s*(?:&nbsp;|<br\s*\/?>|\s)*<\/p>/gi, "")
    .replace(/<div\b[^>]*>\s*(?:&nbsp;|<br\s*\/?>|\s)*<\/div>/gi, "")
    .replace(/(?:\s*<br\s*\/?>\s*){3,}/gi, "<br /><br />")
    .replace(/>\s{2,}</g, "><")
    .trim();
}

function sanitizeImageTag(tag: string): string {
  const attributes = readTagAttributes(tag);
  const src = normalizeReadableImageSource(attributes.src ?? attributes["data-src"] ?? "");
  if (!src) {
    return "";
  }
  const alt = normalizeReadableImageAlt(attributes.alt ?? "文章配图");
  return `<img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`;
}

function readTagAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = decodeHtmlAttribute((match[2] ?? match[3] ?? match[4] ?? "").trim());
  }
  return attributes;
}

function normalizeReadableImageSource(value: string): string {
  const src = value.trim();
  if (!src) {
    return "";
  }
  if (src.startsWith("//")) {
    return `https:${src}`;
  }
  if (/^https?:\/\//i.test(src) || src.startsWith("/api/assets/images/")) {
    return src;
  }
  return "";
}

function normalizeReadableImageAlt(value: string): string {
  const alt = value.trim();
  if (!alt || /^(?:https?:\/\/|www\.)/i.test(alt)) {
    return "文章配图";
  }
  return alt.slice(0, 80);
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildLibraryResults(
  articles: Article[],
  filters: { category: string; favorite: FavoriteFilter; project: string; query: string; sort: SortMode; source: SourceFilter },
): LibraryResult[] {
  const query = filters.query.trim().toLowerCase();
  const results: LibraryResult[] = [];

  for (const article of articles) {
    const category = articleCategory(article);
    if (filters.category !== ALL_CATEGORIES && category !== filters.category) {
      continue;
    }
    if (filters.source !== ALL_SOURCES && article.sourceType !== filters.source) {
      continue;
    }
    if (filters.project !== ALL_PROJECTS && articleSourceProject(article) !== filters.project) {
      continue;
    }
    if (filters.favorite === "favorites" && !isArticleFavorite(article)) {
      continue;
    }

    const searchInfo = getArticleSearchInfo(article, query, category);
    if (query && searchInfo.score <= 0) {
      continue;
    }
    results.push({
      article,
      ...searchInfo,
    });
  }

  return results.sort((left, right) => compareLibraryResults(left, right, filters.sort, Boolean(query)));
}

function getArticleSearchInfo(article: Article, query: string, category: string): Omit<LibraryResult, "article"> {
  const fields = [
    { label: "标题", score: 90, value: article.title },
    { label: "收藏", score: 74, value: isArticleFavorite(article) ? "特别收藏 收藏 星标" : "" },
    { label: "标签", score: 70, value: article.tags.join(" ") },
    { label: "分类", score: 58, value: category },
    { label: "项目", score: 52, value: articleSourceProject(article) },
    { label: "来源", score: 44, value: `${article.sourceName} ${article.sourceAccount} ${article.author}` },
    { label: "正文", score: 18, value: article.contentText || htmlTextContent(article.contentHtml) },
  ];
  let score = 0;
  const matchedFields: string[] = [];

  if (query) {
    for (const field of fields) {
      const value = field.value.toLowerCase();
      if (value.includes(query)) {
        score += field.score;
        matchedFields.push(`${field.label}命中`);
      }
    }
  }

  return {
    matchedFields,
    score,
    snippet: createArticleSnippet(article, query),
  };
}

function compareLibraryResults(left: LibraryResult, right: LibraryResult, sort: SortMode, hasQuery: boolean): number {
  if (sort === "relevance" && hasQuery && left.score !== right.score) {
    return right.score - left.score;
  }
  if (sort === "publishedDesc") {
    return compareDateDesc(left.article.publishedAt, right.article.publishedAt) || compareDateDesc(left.article.updatedAt, right.article.updatedAt);
  }
  if (sort === "titleAsc") {
    return left.article.title.localeCompare(right.article.title, SEARCH_LOCALE);
  }
  if (sort === "wordCountDesc") {
    return articleWordCount(right.article) - articleWordCount(left.article) || compareDateDesc(left.article.updatedAt, right.article.updatedAt);
  }
  return compareDateDesc(left.article.updatedAt, right.article.updatedAt);
}

function compareDateDesc(left: string, right: string): number {
  return new Date(right || 0).getTime() - new Date(left || 0).getTime();
}

function createArticleSnippet(article: Article, query: string): string {
  const text = compactText(article.contentText || htmlTextContent(article.contentHtml));
  if (!text) {
    return "暂无正文摘要";
  }
  if (!query) {
    return clipText(text, 104);
  }

  const lowerText = text.toLowerCase();
  const index = lowerText.indexOf(query);
  if (index < 0) {
    return clipText(text, 104);
  }
  const start = Math.max(0, index - 42);
  const end = Math.min(text.length, index + query.length + 68);
  return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clipText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function articleWordCount(article: Article): number {
  return compactText(article.contentText || htmlTextContent(article.contentHtml)).replace(/\s/g, "").length;
}

function formatArticleDate(article: Article): string {
  return article.publishedAt || article.updatedAt.slice(0, 10) || "未标日期";
}

function articleSourceProject(article: Article): string {
  return article.sourceProject?.trim() || article.sourceName || "未分组引用素材";
}

function draftChannel(draft: LocalDraft): ContentChannel {
  return draft.contentChannel === "xiaohongshu" ? "xiaohongshu" : "wechat";
}

function firstPendingDraftForChannel(drafts: LocalDraft[], channel: ContentChannel): LocalDraft | null {
  return drafts.filter((draft) => draftChannel(draft) === channel && isPendingDraft(draft)).sort(compareDraftQueue)[0] ?? null;
}

function draftToEditorState(draft: LocalDraft | null | undefined): DraftEditorState {
  return {
    title: draft?.title ?? "",
    body: draft?.body ?? "",
    notes: draft?.notes ?? "",
    publishStatus: draft && isPendingDraft(draft) ? draftStatus(draft) : "draft",
    plannedPublishAt: toDateTimeLocalValue(draft?.plannedPublishAt),
  };
}

function isPendingDraft(draft: LocalDraft): boolean {
  const status = draftStatus(draft);
  return status === "draft" || status === "queued";
}

function draftStatus(draft: LocalDraft): PublishStatus {
  return draft.publishStatus === "queued" || draft.publishStatus === "published" || draft.publishStatus === "archived"
    ? draft.publishStatus
    : "draft";
}

function channelLabel(channel: ContentChannel): string {
  return channel === "xiaohongshu" ? "小红书" : "微信公众号";
}

function channelPageTitle(channel: ContentChannel): string {
  return localArticleCollectionLabel(channel);
}

function localArticleCollectionLabel(channel: ContentChannel): string {
  return channel === "xiaohongshu" ? "本地小红书文章" : "本地公众号文章";
}

function publishStatusLabel(status: PublishStatus): string {
  if (status === "queued") {
    return "待发布";
  }
  if (status === "published") {
    return "已发布";
  }
  if (status === "archived") {
    return "归档";
  }
  return "草稿";
}

function buildDraftStats(drafts: LocalDraft[]): Record<PublishStatus, number> {
  const stats: Record<PublishStatus, number> = {
    draft: 0,
    queued: 0,
    published: 0,
    archived: 0,
  };
  for (const draft of drafts) {
    stats[draftStatus(draft)] += 1;
  }
  return stats;
}

function compareDraftQueue(left: LocalDraft, right: LocalDraft): number {
  const statusOrder: Record<PublishStatus, number> = {
    queued: 0,
    draft: 1,
    published: 2,
    archived: 3,
  };
  return (
    statusOrder[draftStatus(left)] - statusOrder[draftStatus(right)] ||
    (left.queueOrder ?? 0) - (right.queueOrder ?? 0) ||
    compareDateDesc(left.updatedAt, right.updatedAt)
  );
}

function toDateTimeLocalValue(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 16);
  }
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStructureRunDate(run: WritingStructureRun): string {
  return run.createdAt.slice(0, 10) || "刚刚";
}

function stripPreviewHtml(value: string): string {
  return htmlTextContent(value).replace(/\s+/g, " ").trim();
}

function readStoredThemeMode(): ThemeMode | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return normalizeThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStoredThemeMode(themeMode: ThemeMode) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  } catch {
    // Storage can be disabled in private browsing; the cookie still keeps the preference.
  }
}

function writeThemeCookie(themeMode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${THEME_COOKIE_NAME}=${themeMode}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function writeThemePreference(themeMode: ThemeMode) {
  writeStoredThemeMode(themeMode);
  writeThemeCookie(themeMode);
}

function isArticleFavorite(article: Article): boolean {
  return Boolean(article.isFavorite);
}

function uniqueCategories(categories: string[]): string[] {
  return Array.from(new Set(categories.map(normalizeArticleCategory))).filter(Boolean);
}

async function mapWithConcurrency<T, Result>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<Result>,
): Promise<Result[]> {
  const results: Result[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function upsertArticle(current: Article[], article: Article): Article[] {
  const existing = current.some((item) => item.id === article.id);
  if (existing) {
    return current.map((item) => (item.id === article.id ? article : item));
  }
  return [article, ...current];
}

function upsertDraft(current: LocalDraft[], draft: LocalDraft): LocalDraft[] {
  const existing = current.some((item) => item.id === draft.id);
  const next = existing ? current.map((item) => (item.id === draft.id ? draft : item)) : [draft, ...current];
  return next.sort(compareDraftQueue);
}

function upsertStructureRuns(current: WritingStructureRun[], runs: WritingStructureRun[]): WritingStructureRun[] {
  const byId = new Map(current.map((run) => [run.id, run]));
  for (const run of runs) {
    byId.set(run.id, run);
  }
  return Array.from(byId.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function sourceTypeLabel(sourceType: Article["sourceType"]): string {
  if (sourceType === "wechat") {
    return "公众号链接";
  }
  if (sourceType === "manual") {
    return "手动录入";
  }
  return "网页链接";
}

function workspaceButtonClassName(active: boolean): string {
  return active ? "workspace-tab workspace-tab-active" : "workspace-tab";
}

function importModeButtonClassName(active: boolean): string {
  return active ? "import-mode-button import-mode-button-active" : "import-mode-button";
}

const inputClassName = "field";
const textareaClassName = "textarea";
const primaryButtonClassName = "btn btn-primary";
const secondaryButtonClassName = "btn btn-secondary";
const EDITABLE_TAIL_MARKER_PATTERN =
  /(?:一键三连|小心心|欢迎在评论区|评论区留下|点亮星标|科技前沿进展每日见|—\s*完\s*—|全文完|好文推荐|相关推荐)/i;
const EDITABLE_ENGAGEMENT_TAIL_MARKER_PATTERN = /(?:点赞.{0,32}转发|转发.{0,32}点赞)/i;
const EDITABLE_END_TAIL_MARKER_PATTERN = /\bEND\b/;
