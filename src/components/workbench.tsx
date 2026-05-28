"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  Brain,
  CheckCircle2,
  Database,
  ChevronDown,
  ChevronUp,
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
  AgentDraft,
  AgentDraftStatus,
  AgentStrategy,
  AgentStrategyModule,
  AgentStrategyModuleRole,
  Article,
  ArticleParseRun,
  ContentChannel,
  ContentAgentRun,
  LocalDraft,
  PublishStatus,
} from "@/lib/types";
import type { ThemeMode } from "@/lib/theme";

type WorkbenchProps = {
  initialArticles: Article[];
  initialAgentDrafts?: AgentDraft[];
  initialAgentStrategies?: AgentStrategy[];
  initialDrafts?: LocalDraft[];
  templates: AnalysisTemplate[];
  initialAiSettings?: unknown;
  initialImageSettings?: unknown;
  initialWeChatConfig?: unknown;
  initialThemeMode?: ThemeMode;
};

type Notice = {
  type: "ok" | "error" | "info";
  text: string;
};

type Workspace = "library" | "wechat" | "xiaohongshu" | "agent";
type ImportMode = "url" | "manual";
type ActiveModal = "analysis" | "import" | "edit" | "manage" | null;
type ReaderDropdown = "actions" | "filters" | null;
type DraftBoardFilter = "all" | PublishStatus;
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
type AgentDraftEditorState = {
  title: string;
  bodyHtml: string;
  status: AgentDraftStatus;
};

const SUCCESS_NOTICE_DURATION_MS = 3000;
const ALL_CATEGORIES = "全部";
const ALL_SOURCES = "all" as const;
const ALL_PROJECTS = "全部";
const SEARCH_LOCALE = "zh-Hans-CN";

export function Workbench({
  initialArticles,
  initialAgentDrafts = [],
  initialAgentStrategies = [],
  initialDrafts = [],
  templates,
  initialThemeMode = DEFAULT_THEME_MODE,
}: WorkbenchProps) {
  const [articles, setArticles] = useState(initialArticles);
  const [agentDrafts, setAgentDrafts] = useState(initialAgentDrafts);
  const [agentStrategies, setAgentStrategies] = useState(initialAgentStrategies);
  const [localDrafts, setLocalDrafts] = useState(initialDrafts);
  const [selectedId, setSelectedId] = useState(initialArticles[0]?.id ?? "");
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>("library");
  const [draftBoardFilter, setDraftBoardFilter] = useState<DraftBoardFilter>("all");
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
  const initialSelectedDraft = firstDraftForChannel(initialDrafts, "wechat", "all");
  const [selectedDraftId, setSelectedDraftId] = useState(initialSelectedDraft?.id ?? "");
  const [draftEditor, setDraftEditor] = useState<DraftEditorState>(() => draftToEditorState(initialSelectedDraft));
  const [selectedAgentStrategyId, setSelectedAgentStrategyId] = useState(initialAgentStrategies[0]?.id ?? "");
  const [agentTopic, setAgentTopic] = useState("");
  const [agentReferenceIds, setAgentReferenceIds] = useState<string[]>(() => initialArticles.slice(0, 3).map((article) => article.id));
  const [selectedAgentDraftId, setSelectedAgentDraftId] = useState(initialAgentDrafts[0]?.id ?? "");
  const [agentDraftEditor, setAgentDraftEditor] = useState<AgentDraftEditorState>(() => agentDraftToEditorState(initialAgentDrafts[0] ?? null));
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

  const activeContentChannel = activeWorkspace === "xiaohongshu" ? "xiaohongshu" : "wechat";
  const isContentWorkspace = activeWorkspace !== "library";

  const channelDrafts = useMemo(
    () => localDrafts.filter((draft) => draftChannel(draft) === activeContentChannel).sort(compareDraftQueue),
    [activeContentChannel, localDrafts],
  );

  const visibleChannelDrafts = useMemo(
    () => channelDrafts.filter((draft) => draftMatchesBoardFilter(draft, draftBoardFilter)),
    [channelDrafts, draftBoardFilter],
  );

  const channelStats = useMemo(() => buildDraftStats(channelDrafts), [channelDrafts]);
  const wechatSyncStats = useMemo(() => buildWeChatSyncStats(channelDrafts), [channelDrafts]);

  const selectedLocalDraft = useMemo(
    () => visibleChannelDrafts.find((draft) => draft.id === selectedDraftId) ?? visibleChannelDrafts[0] ?? null,
    [visibleChannelDrafts, selectedDraftId],
  );

  const selectedAgentStrategy = useMemo(
    () => agentStrategies.find((strategy) => strategy.id === selectedAgentStrategyId) ?? agentStrategies[0] ?? null,
    [agentStrategies, selectedAgentStrategyId],
  );

  const selectedAgentDraft = useMemo(
    () => agentDrafts.find((draft) => draft.id === selectedAgentDraftId) ?? agentDrafts[0] ?? null,
    [agentDrafts, selectedAgentDraftId],
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
    const draft = channelDrafts.find((item) => item.id === draftId) ?? null;
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
        const nextDrafts = upsertDraft(localDrafts, updated);
        const nextDraft = draftMatchesBoardFilter(updated, draftBoardFilter)
          ? updated
          : firstDraftForChannel(nextDrafts, draftChannel(updated), draftBoardFilter);
        selectDraftForEditing(nextDraft);
      }
      setNotice({ type: "ok", text: publishStatus === "published" ? `已标记发布：${draft.title}` : `已更新本地文章状态：${publishStatusLabel(publishStatus)}` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "本地文章状态更新失败" });
    } finally {
      setBusy(null);
    }
  }

  async function handleDraftReorder(draft: LocalDraft, direction: -1 | 1) {
    const index = visibleChannelDrafts.findIndex((item) => item.id === draft.id);
    const neighbor = visibleChannelDrafts[index + direction];
    if (!neighbor) {
      return;
    }
    setBusy(`draft-order-${draft.id}`);
    try {
      const draftOrder = effectiveDraftOrder(draft, index);
      const neighborOrder = effectiveDraftOrder(neighbor, index + direction);
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

  async function handlePushLocalDraftToWeChat(draft: LocalDraft) {
    if (draftChannel(draft) !== "wechat") {
      setNotice({ type: "error", text: "只有微信公众号草稿可以推送到微信后台" });
      return;
    }
    setBusy(`draft-wechat-${draft.id}`);
    try {
      const response = await fetch(`/api/drafts/${draft.id}/wechat-draft`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message ?? data.error ?? "推送微信草稿箱失败");
      }
      if (data.draft) {
        setLocalDrafts((current) => upsertDraft(current, data.draft));
        if (selectedDraftId === draft.id) {
          selectDraftForEditing(data.draft);
        }
      }
      setNotice({ type: "ok", text: data.message ?? "已推送到微信草稿箱" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "推送微信草稿箱失败" });
    } finally {
      setBusy(null);
    }
  }

  function handleAgentReferenceToggle(articleId: string) {
    setAgentReferenceIds((current) =>
      current.includes(articleId) ? current.filter((id) => id !== articleId) : [...current, articleId],
    );
  }

  async function handleAgentDraftGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const topic = agentTopic.trim();
    if (!topic) {
      setNotice({ type: "error", text: "请输入本次要生成的选题" });
      return;
    }
    if (agentReferenceIds.length === 0) {
      setNotice({ type: "error", text: "至少选择一篇引用知识库文章作为参考" });
      return;
    }
    if (!selectedAgentStrategy) {
      setNotice({ type: "error", text: "请先选择一个 Agent 策略" });
      return;
    }

    setBusy("agent-generate");
    setNotice({ type: "info", text: `${selectedAgentStrategy.name} 正在分工、写稿和审稿` });
    try {
      const response = await fetch("/api/agent/drafts/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic,
          referenceArticleIds: agentReferenceIds,
          strategyId: selectedAgentStrategy.id,
          targetChannel: selectedAgentStrategy.targetChannel,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { agentDraft?: AgentDraft; error?: string };
      if (!response.ok || !data.agentDraft) {
        throw new Error(data.error ?? "Agent 草稿生成失败");
      }
      setAgentDrafts((current) => upsertAgentDraft(current, data.agentDraft as AgentDraft));
      selectAgentDraftForEditing(data.agentDraft);
      setNotice({
        type: data.agentDraft.warnings && data.agentDraft.warnings.length > 0 ? "info" : "ok",
        text:
          data.agentDraft.warnings && data.agentDraft.warnings.length > 0
            ? `Agent 草稿已生成，但有 ${data.agentDraft.warnings.length} 条长句复用提醒`
            : `Agent 草稿已生成：${data.agentDraft.title}`,
      });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Agent 草稿生成失败" });
    } finally {
      setBusy(null);
    }
  }

  async function handleAgentStrategySave(strategy: AgentStrategy) {
    setBusy(`agent-strategy-${strategy.id}`);
    try {
      const response = await fetch(`/api/agent/strategies/${strategy.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(strategy),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.strategy) {
        throw new Error(data.error ?? "Agent 策略保存失败");
      }
      setAgentStrategies((current) => upsertAgentStrategy(current, data.strategy));
      setSelectedAgentStrategyId(data.strategy.id);
      setNotice({ type: "ok", text: `已保存策略：${data.strategy.name}` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Agent 策略保存失败" });
    } finally {
      setBusy(null);
    }
  }

  async function handleAgentStrategyCreate() {
    setBusy("agent-strategy-create");
    try {
      const response = await fetch("/api/agent/strategies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "新的公众号 Agent 策略",
          description: "从这里配置模块角色、顺序、模型和 prompt。",
          targetChannel: "wechat",
          modules: [
            {
              id: `module-${Date.now()}`,
              name: "主笔 Agent",
              role: "writer",
              order: 1,
              model: "",
              prompt: "写一篇克制、有工程判断、适合公众号阅读的原创技术文章。",
              enabled: true,
            },
            {
              id: `review-${Date.now()}`,
              name: "审稿 Agent",
              role: "review",
              order: 2,
              model: "",
              prompt: "检查事实风险、洗稿风险、销售 CTA 和公众号可读性。",
              enabled: true,
            },
          ],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.strategy) {
        throw new Error(data.error ?? "新建 Agent 策略失败");
      }
      setAgentStrategies((current) => upsertAgentStrategy(current, data.strategy));
      setSelectedAgentStrategyId(data.strategy.id);
      setNotice({ type: "ok", text: `已新建策略：${data.strategy.name}` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "新建 Agent 策略失败" });
    } finally {
      setBusy(null);
    }
  }

  async function patchAgentDraft(draftId: string, payload: Partial<AgentDraft>): Promise<AgentDraft> {
    const response = await fetch(`/api/agent/drafts/${draftId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.agentDraft) {
      throw new Error(data.error ?? "Agent 草稿保存失败");
    }
    setAgentDrafts((current) => upsertAgentDraft(current, data.agentDraft));
    return data.agentDraft as AgentDraft;
  }

  function selectAgentDraftForEditing(draft: AgentDraft | null) {
    setSelectedAgentDraftId(draft?.id ?? "");
    setAgentDraftEditor(agentDraftToEditorState(draft));
  }

  async function handleAgentDraftSave() {
    if (!selectedAgentDraft) {
      return;
    }
    if (!agentDraftEditor.title.trim() || !stripPreviewHtml(agentDraftEditor.bodyHtml).trim()) {
      setNotice({ type: "error", text: "Agent 草稿标题和正文不能为空" });
      return;
    }
    setBusy(`agent-draft-edit-${selectedAgentDraft.id}`);
    try {
      const updated = await patchAgentDraft(selectedAgentDraft.id, {
        title: agentDraftEditor.title,
        bodyHtml: agentDraftEditor.bodyHtml,
        status: agentDraftEditor.status,
      });
      selectAgentDraftForEditing(updated);
      setNotice({ type: "ok", text: "Agent 草稿已保存" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Agent 草稿保存失败" });
    } finally {
      setBusy(null);
    }
  }

  async function handleAgentPushLocal(draft: AgentDraft) {
    setBusy(`agent-push-local-${draft.id}`);
    try {
      const response = await fetch(`/api/agent/drafts/${draft.id}/push-local`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.agentDraft || !data.draft) {
        throw new Error(data.error ?? "推到本地公众号管理失败");
      }
      setAgentDrafts((current) => upsertAgentDraft(current, data.agentDraft));
      setLocalDrafts((current) => upsertDraft(current, data.draft));
      setNotice({ type: "ok", text: `已推到本地公众号管理：${data.draft.title}` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "推到本地公众号管理失败" });
    } finally {
      setBusy(null);
    }
  }

  async function handleAgentPushWechat(draft: AgentDraft) {
    setBusy(`agent-push-wechat-${draft.id}`);
    try {
      const response = await fetch(`/api/agent/drafts/${draft.id}/push-wechat`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.agentDraft) {
        throw new Error(data.message ?? data.error ?? "直推微信后台失败");
      }
      setAgentDrafts((current) => upsertAgentDraft(current, data.agentDraft));
      if (data.draft) {
        setLocalDrafts((current) => upsertDraft(current, data.draft));
      }
      setNotice({ type: "ok", text: data.message ?? "已推送到微信草稿箱" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "直推微信后台失败" });
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

  const workspaceKicker = workspaceKickerLabel(activeWorkspace, activeContentChannel);
  const workspaceTitle = workspaceTitleLabel(activeWorkspace, activeContentChannel);
  const nextThemeMode = themeMode === "dark" ? "light" : "dark";
  const isLibraryEmptyState = activeWorkspace === "library" && !selectedArticle;
  const wechatWorkspaceDrafts = localDrafts.filter((draft) => draftChannel(draft) === "wechat");
  const xiaohongshuWorkspaceDrafts = localDrafts.filter((draft) => draftChannel(draft) === "xiaohongshu");
  const wechatWorkspaceStats = buildDraftStats(wechatWorkspaceDrafts);
  const wechatWorkspaceSyncStats = buildWeChatSyncStats(wechatWorkspaceDrafts);
  const activeStrategyCount = agentStrategies.filter((strategy) => strategy.status !== "archived").length;
  const enabledAgentModuleCount = agentStrategies.reduce(
    (total, strategy) => total + strategy.modules.filter((module) => module.enabled).length,
    0,
  );

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

  function openContentWorkspace(workspace: "wechat" | "xiaohongshu") {
    const channel = workspace === "xiaohongshu" ? "xiaohongshu" : "wechat";
    setActiveWorkspace(workspace);
    setActiveModal(null);
    setReaderDropdown(null);
    setDraftBoardFilter("all");
    selectDraftForEditing(firstDraftForChannel(localDrafts, channel, "all"));
  }

  function openAgentWorkspace() {
    setActiveWorkspace("agent");
    setActiveModal(null);
    setReaderDropdown(null);
  }

  function updateDraftBoardFilter(filter: DraftBoardFilter) {
    setDraftBoardFilter(filter);
    selectDraftForEditing(firstDraftForChannel(localDrafts, activeContentChannel, filter));
  }

  return (
    <main className="studio-shell" data-theme={themeMode}>
      <a className="skip-link" href="#workspace-content">
        跳到工作区内容
      </a>
      <header className="studio-topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Database className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <div className="brand-title">账号文章系统</div>
            <div className="brand-meta">
              {articles.length} 篇引用素材 · {localDrafts.length} 篇公众号/小红书作品 · {agentDrafts.length} 篇 Agent 草稿
            </div>
          </div>
        </div>

        <div className="topbar-actions">
          <Link href="/generate" className="topbar-generate-button">
            <Sparkles className="h-4 w-4" />
            生成中心
          </Link>
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

      <section className="studio-command-strip" aria-label="工作台状态总览">
        <div className="command-copy">
          <span className="command-kicker">Content operations</span>
          <h2>账号内容生产工作台</h2>
          <p>把外部素材、平台草稿、Agent 写作和微信投递放在一个清楚的操作面里。</p>
        </div>
        <nav className="workspace-switch workspace-switch-cards" aria-label="工作区">
          <WorkspaceCommandButton
            active={activeWorkspace === "library"}
            detail={`${favoriteCount} 篇收藏 · ${filteredArticles.length} 篇当前可见`}
            label="引用知识库"
            metric={`${articles.length} 篇`}
            onClick={() => {
              setActiveWorkspace("library");
              setActiveModal(null);
              setReaderDropdown(null);
            }}
          />
          <WorkspaceCommandButton
            active={activeWorkspace === "wechat"}
            detail={`${wechatWorkspaceStats.queued} 篇待发布 · ${wechatWorkspaceSyncStats.sent} 篇已进微信`}
            label="微信公众号"
            metric={`${wechatWorkspaceDrafts.length} 篇`}
            onClick={() => {
              openContentWorkspace("wechat");
            }}
          />
          <WorkspaceCommandButton
            active={activeWorkspace === "xiaohongshu"}
            detail="入口保留，等待平台流程接入"
            label="小红书"
            metric={`${xiaohongshuWorkspaceDrafts.length} 篇`}
            onClick={() => {
              openContentWorkspace("xiaohongshu");
            }}
          />
          <WorkspaceCommandButton
            active={activeWorkspace === "agent"}
            detail={`${activeStrategyCount} 个策略 · ${enabledAgentModuleCount} 个启用模块`}
            label="Agent"
            metric={`${agentDrafts.length} 篇`}
            onClick={openAgentWorkspace}
          />
        </nav>
      </section>

      <div
        id="workspace-content"
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
            aria-label="展开素材列表"
            aria-expanded={libraryRailOpen}
            onClick={() => setLibraryRailOpen(true)}
          >
            <PanelLeftOpen className="h-4 w-4" />
            <span>素材列表</span>
          </button>
        ) : null}

        <section className="reader-stage">
          <header className={`reader-header ${isLibraryEmptyState ? "reader-header-empty" : ""}`}>
            <div className={`reader-heading ${isLibraryEmptyState ? "reader-heading-empty" : ""}`}>
              <div className="kicker">{workspaceKicker}</div>
              <h1 className={`reader-title ${isLibraryEmptyState ? "reader-title-empty" : ""}`}>
                {activeWorkspace === "library" ? selectedArticle?.title ?? "选择引用素材" : workspaceTitle}
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
            {activeWorkspace === "wechat" ? (
              <section className="wechat-workspace" aria-label={localArticleCollectionLabel(activeContentChannel)}>
                <ContentDraftWorkbench
                  busy={busy}
                  channel={activeContentChannel}
                  draftEditor={draftEditor}
                  drafts={visibleChannelDrafts}
                  filter={draftBoardFilter}
                  onCreateBlank={handleCreateBlankDraft}
                  onEditorChange={(patch) => setDraftEditor((current) => ({ ...current, ...patch }))}
                  onFilterChange={updateDraftBoardFilter}
                  onMove={handleDraftReorder}
                  onPushWechat={handlePushLocalDraftToWeChat}
                  onSave={handleDraftEditorSave}
                  onSelect={handleDraftSelect}
                  onStatusChange={handleDraftStatusChange}
                  selectedDraft={selectedLocalDraft}
                  stats={channelStats}
                  syncStats={wechatSyncStats}
                  totalCount={channelDrafts.length}
                />
              </section>
            ) : activeWorkspace === "agent" ? (
              <AgentWorkspace
                agentDraftEditor={agentDraftEditor}
                agentDrafts={agentDrafts}
                agentReferenceIds={agentReferenceIds}
                agentStrategies={agentStrategies}
                agentTopic={agentTopic}
                articles={articles}
                busy={busy}
                onCreateStrategy={handleAgentStrategyCreate}
                onDraftEditorChange={(patch) => setAgentDraftEditor((current) => ({ ...current, ...patch }))}
                onDraftGenerate={handleAgentDraftGenerate}
                onDraftPushLocal={handleAgentPushLocal}
                onDraftPushWechat={handleAgentPushWechat}
                onDraftSave={handleAgentDraftSave}
                onDraftSelect={(draftId) => selectAgentDraftForEditing(agentDrafts.find((draft) => draft.id === draftId) ?? null)}
                onReferenceToggle={handleAgentReferenceToggle}
                onStrategyChange={setSelectedAgentStrategyId}
                onStrategySave={handleAgentStrategySave}
                onTopicChange={setAgentTopic}
                selectedAgentDraft={selectedAgentDraft}
                selectedAgentDraftId={selectedAgentDraftId}
                selectedAgentStrategy={selectedAgentStrategy}
                selectedAgentStrategyId={selectedAgentStrategyId}
              />
            ) : activeWorkspace === "xiaohongshu" ? (
              <XiaohongshuPlaceholder />
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
  filter,
  onCreateBlank,
  onEditorChange,
  onFilterChange,
  onMove,
  onPushWechat,
  onSave,
  onSelect,
  onStatusChange,
  selectedDraft,
  stats,
  syncStats,
  totalCount,
}: {
  busy: string | null;
  channel: ContentChannel;
  draftEditor: DraftEditorState;
  drafts: LocalDraft[];
  filter: DraftBoardFilter;
  onCreateBlank: () => void;
  onEditorChange: (patch: Partial<DraftEditorState>) => void;
  onFilterChange: (filter: DraftBoardFilter) => void;
  onMove: (draft: LocalDraft, direction: -1 | 1) => void | Promise<void>;
  onPushWechat?: (draft: LocalDraft) => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onSelect: (draftId: string) => void;
  onStatusChange: (draft: LocalDraft, status: PublishStatus) => void | Promise<void>;
  selectedDraft: LocalDraft | null;
  stats: Record<PublishStatus, number>;
  syncStats: Record<LocalDraft["wechatDraftStatus"], number>;
  totalCount: number;
}) {
  const label = channelLabel(channel);
  const selectedStatus = draftEditor.publishStatus;
  const filterOptions: Array<{ value: DraftBoardFilter; label: string; count: number }> = [
    { value: "all", label: "全部作品", count: totalCount },
    { value: "draft", label: "草稿箱", count: stats.draft ?? 0 },
    { value: "queued", label: "待发布", count: stats.queued ?? 0 },
    { value: "published", label: "已发布", count: stats.published ?? 0 },
    { value: "archived", label: "归档", count: stats.archived ?? 0 },
  ];

  return (
    <section className="panel content-draft-workbench" aria-label={`${label}内容管理工作台`}>
      <div className="content-draft-heading">
        <div>
          <div className="panel-title">
            <FileText className="h-4 w-4 text-[var(--blue)]" />
            {label}内容管理台
          </div>
          <p className="panel-copy">
            统一看本地草稿箱、待发布、已发布和归档作品；微信草稿箱状态会跟随推送结果更新。
          </p>
        </div>
        <button type="button" className="btn btn-secondary content-create-button" disabled={busy === "draft-create"} onClick={onCreateBlank}>
          {busy === "draft-create" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
          新建空白草稿
        </button>
      </div>

      <div className="content-draft-summary-grid" aria-label={`${label}作品概览`}>
        <DraftMetricCard label="全部作品" value={totalCount} detail={`微信草稿箱 ${syncStats.sent ?? 0} 篇`} />
        <DraftMetricCard label="本地草稿箱" value={stats.draft ?? 0} detail={`未推送 ${syncStats.not_sent ?? 0} 篇`} />
        <DraftMetricCard label="待发布" value={stats.queued ?? 0} detail="需要进入发布流程" />
        <DraftMetricCard label="已发布作品" value={stats.published ?? 0} detail={`同步失败 ${syncStats.failed ?? 0} 篇`} />
      </div>

      <div className="content-draft-filters" role="tablist" aria-label={`${label}作品状态筛选`}>
        {filterOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-label={`${option.label} ${option.count}`}
            aria-selected={filter === option.value}
            className={`content-draft-filter ${filter === option.value ? "content-draft-filter-active" : ""}`}
            onClick={() => onFilterChange(option.value)}
          >
            <span>{option.label}</span>
            <strong>{option.count}</strong>
          </button>
        ))}
      </div>

      <div className="content-draft-shell">
        <div className="content-draft-list" aria-label={`${label}作品列表`}>
          {drafts.map((draft, index) => (
            <article
              key={draft.id}
              className={`content-draft-item content-draft-item-${draftStatus(draft)} ${
                selectedDraft?.id === draft.id ? "content-draft-item-active" : ""
              }`}
            >
              <div className="content-order-controls" aria-label="调整发布顺序">
                <button
                  type="button"
                  className="content-order-button"
                  aria-label={`上移：${draft.title}`}
                  title="上移"
                  disabled={index === 0 || busy === `draft-order-${draft.id}`}
                  onClick={() => void onMove(draft, -1)}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <span aria-label={`发布顺序 ${displayDraftOrder(draft, index)}`}>{displayDraftOrder(draft, index)}</span>
                <button
                  type="button"
                  className="content-order-button"
                  aria-label={`下移：${draft.title}`}
                  title="下移"
                  disabled={index === drafts.length - 1 || busy === `draft-order-${draft.id}`}
                  onClick={() => void onMove(draft, 1)}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <button type="button" className="content-draft-item-main" aria-pressed={selectedDraft?.id === draft.id} onClick={() => onSelect(draft.id)}>
                <span className="content-queue-title">{draft.title}</span>
                <span className="content-queue-preview">{draftPreviewText(draft).slice(0, 160) || "暂无正文"}</span>
                <span className="content-queue-meta">
                  <span className={`content-draft-status-pill content-draft-status-${draftStatus(draft)}`}>
                    {publishStatusLabel(draftStatus(draft))}
                  </span>
                  <span>{draftTimelineLabel(draft)}</span>
                  <span>{wechatDraftStatusLabel(draft.wechatDraftStatus, channel)}</span>
                </span>
              </button>
            </article>
          ))}
          {drafts.length === 0 ? (
            <div className="empty-list">
              <div className="empty-list-title">没有匹配作品</div>
              <p>切换状态筛选，或新建一篇空白草稿继续整理。</p>
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
                  <option value="published">已发布</option>
                  <option value="archived">归档</option>
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
                  disabled={busy === `draft-status-${selectedDraft.id}` || draftStatus(selectedDraft) === "published"}
                  onClick={() => void onStatusChange(selectedDraft, "published")}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {draftStatus(selectedDraft) === "published" ? "已发布" : "标为已发布"}
                </button>
                {channel === "wechat" ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!onPushWechat || busy === `draft-wechat-${selectedDraft.id}` || selectedDraft.wechatDraftStatus === "sent"}
                    onClick={() => {
                      if (onPushWechat) {
                        void onPushWechat(selectedDraft);
                      }
                    }}
                  >
                    {busy === `draft-wechat-${selectedDraft.id}` ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {selectedDraft.wechatDraftStatus === "sent" ? "已进微信草稿箱" : "推送微信草稿箱"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy === `draft-status-${selectedDraft.id}`}
                  onClick={() => void onStatusChange(selectedDraft, draftStatus(selectedDraft) === "archived" ? "draft" : "archived")}
                >
                  <Archive className="h-4 w-4" />
                  {draftStatus(selectedDraft) === "archived" ? "移回草稿箱" : "归档"}
                </button>
              </div>

              <section className="content-draft-preview-panel" aria-label="正文预览">
                <div className="metric-line">
                  <span className="field-label">正文预览</span>
                  <span className="tiny-meta">
                    {publishStatusLabel(selectedStatus)} · {wechatDraftStatusLabel(selectedDraft.wechatDraftStatus, channel)} · {stripPreviewHtml(draftEditor.body).length} 字
                  </span>
                </div>
                <div className="content-draft-readable">
                  <ReadableContent content={draftEditor.body || "暂无正文"} />
                </div>
              </section>
            </>
          ) : (
            <div className="empty-list">
              <div className="empty-list-title">请选择一个草稿</div>
              <p>左侧会列出当前状态下的{label}作品，点开后可以编辑标题、正文、状态和排期。</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function WorkspaceCommandButton({
  active,
  detail,
  label,
  metric,
  onClick,
}: {
  active: boolean;
  detail: string;
  label: string;
  metric: string;
  onClick: () => void;
}) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={workspaceButtonClassName(active)}>
      <span className="workspace-tab-label">{label}</span>
      <strong>{metric}</strong>
      <small>{detail}</small>
    </button>
  );
}

function DraftMetricCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="content-draft-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
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

function AgentWorkspace({
  agentDraftEditor,
  agentDrafts,
  agentReferenceIds,
  agentStrategies,
  agentTopic,
  articles,
  busy,
  onCreateStrategy,
  onDraftEditorChange,
  onDraftGenerate,
  onDraftPushLocal,
  onDraftPushWechat,
  onDraftSave,
  onDraftSelect,
  onReferenceToggle,
  onStrategyChange,
  onStrategySave,
  onTopicChange,
  selectedAgentDraft,
  selectedAgentDraftId,
  selectedAgentStrategy,
  selectedAgentStrategyId,
}: {
  agentDraftEditor: AgentDraftEditorState;
  agentDrafts: AgentDraft[];
  agentReferenceIds: string[];
  agentStrategies: AgentStrategy[];
  agentTopic: string;
  articles: Article[];
  busy: string | null;
  onCreateStrategy: () => void | Promise<void>;
  onDraftEditorChange: (patch: Partial<AgentDraftEditorState>) => void;
  onDraftGenerate: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onDraftPushLocal: (draft: AgentDraft) => void | Promise<void>;
  onDraftPushWechat: (draft: AgentDraft) => void | Promise<void>;
  onDraftSave: () => void | Promise<void>;
  onDraftSelect: (draftId: string) => void;
  onReferenceToggle: (articleId: string) => void;
  onStrategyChange: (strategyId: string) => void;
  onStrategySave: (strategy: AgentStrategy) => void | Promise<void>;
  onTopicChange: (topic: string) => void;
  selectedAgentDraft: AgentDraft | null;
  selectedAgentDraftId: string;
  selectedAgentStrategy: AgentStrategy | null;
  selectedAgentStrategyId: string;
}) {
  const activeModules = selectedAgentStrategy?.modules.filter((module) => module.enabled).sort((left, right) => left.order - right.order) ?? [];
  const generatedDraftCount = agentDrafts.filter((draft) => draft.status === "generated" || draft.status === "editing").length;
  const readyDraftCount = agentDrafts.filter((draft) => draft.status === "approved" || draft.status === "pushed_local" || draft.status === "pushed_wechat").length;

  return (
    <section className="agent-workspace" aria-label="Agent 工作台">
      <section className="agent-ops-overview" aria-label="Agent 状态总览">
        <div className="agent-ops-copy">
          <span className="command-kicker">Agent control room</span>
          <h2>选择写作方式，观察每个 Agent 的工作状态</h2>
          <p>这里把策略、工具链、引用素材和草稿池合成一个独立空间。你可以换策略，也可以直接编辑模块 prompt 和模型。</p>
        </div>
        <div className="agent-ops-metrics">
          <DraftMetricCard label="策略" value={agentStrategies.length} detail={`${activeModules.length} 个模块正在参与当前策略`} />
          <DraftMetricCard label="引用素材" value={agentReferenceIds.length} detail={`从 ${articles.length} 篇知识库里选择`} />
          <DraftMetricCard label="待处理草稿" value={generatedDraftCount} detail={`${readyDraftCount} 篇已确认或已推送`} />
        </div>
        <div className="agent-module-status-grid" aria-label="当前 Agent 模块状态">
          {activeModules.map((module) => (
            <article key={module.id} className="agent-module-status-card">
              <div>
                <span className="agent-status-pill agent-status-pill-ready">启用</span>
                <strong>{module.name}</strong>
                <small>{agentRoleLabel(module.role)} · {module.model || selectedAgentStrategy?.defaultModel || "系统默认模型"}</small>
              </div>
              <p>{clipText(module.prompt, 92)}</p>
            </article>
          ))}
          {activeModules.length === 0 ? (
            <div className="empty-list">
              <div className="empty-list-title">当前策略没有启用模块</div>
              <p>在策略管理里打开至少一个模块后再运行 Agent。</p>
            </div>
          ) : null}
        </div>
      </section>
      <AgentStrategyManagement
        key={selectedAgentStrategy?.id ?? "no-agent-strategy"}
        busy={busy}
        onCreateStrategy={onCreateStrategy}
        onStrategyChange={onStrategyChange}
        onStrategySave={onStrategySave}
        selectedStrategy={selectedAgentStrategy}
        selectedStrategyId={selectedAgentStrategyId}
        strategies={agentStrategies}
      />
      <AgentGenerationPanel
        articles={articles}
        busy={busy}
        onGenerate={onDraftGenerate}
        onReferenceToggle={onReferenceToggle}
        onStrategyChange={onStrategyChange}
        onTopicChange={onTopicChange}
        selectedArticleIds={agentReferenceIds}
        selectedStrategyId={selectedAgentStrategyId}
        strategies={agentStrategies}
        topic={agentTopic}
      />
      <AgentDraftPool
        busy={busy}
        draftEditor={agentDraftEditor}
        drafts={agentDrafts}
        onEditorChange={onDraftEditorChange}
        onPushLocal={onDraftPushLocal}
        onPushWechat={onDraftPushWechat}
        onSave={onDraftSave}
        onSelect={onDraftSelect}
        selectedDraft={selectedAgentDraft}
        selectedDraftId={selectedAgentDraftId}
      />
    </section>
  );
}

function AgentStrategyManagement({
  busy,
  onCreateStrategy,
  onStrategyChange,
  onStrategySave,
  selectedStrategy,
  selectedStrategyId,
  strategies,
}: {
  busy: string | null;
  onCreateStrategy: () => void | Promise<void>;
  onStrategyChange: (strategyId: string) => void;
  onStrategySave: (strategy: AgentStrategy) => void | Promise<void>;
  selectedStrategy: AgentStrategy | null;
  selectedStrategyId: string;
  strategies: AgentStrategy[];
}) {
  const [editor, setEditor] = useState<AgentStrategy | null>(() => cloneAgentStrategy(selectedStrategy));

  function patchEditor(patch: Partial<AgentStrategy>) {
    setEditor((current) => (current ? { ...current, ...patch } : current));
  }

  function patchModule(moduleId: string, patch: Partial<AgentStrategyModule>) {
    setEditor((current) =>
      current
        ? {
            ...current,
            modules: current.modules.map((module) => (module.id === moduleId ? { ...module, ...patch } : module)),
          }
        : current,
    );
  }

  function moveModule(moduleId: string, direction: -1 | 1) {
    setEditor((current) => {
      if (!current) {
        return current;
      }
      const modules = [...current.modules].sort((left, right) => left.order - right.order);
      const index = modules.findIndex((module) => module.id === moduleId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= modules.length) {
        return current;
      }
      const [module] = modules.splice(index, 1);
      modules.splice(nextIndex, 0, module);
      return {
        ...current,
        modules: modules.map((item, itemIndex) => ({ ...item, order: itemIndex + 1 })),
      };
    });
  }

  function addModule() {
    setEditor((current) => {
      if (!current) {
        return current;
      }
      const nextOrder = current.modules.length + 1;
      return {
        ...current,
        modules: [
          ...current.modules,
          {
            id: `module-${Date.now()}`,
            name: "自定义 Agent",
            role: "custom",
            order: nextOrder,
            model: "",
            prompt: "补充这个模块的工作目标、输入边界和验收标准。",
            enabled: true,
          },
        ],
      };
    });
  }

  return (
    <section className="panel agent-strategy-panel" aria-label="策略管理">
      <div className="wechat-section-heading">
        <div>
          <div className="panel-title">
            <Brain className="h-4 w-4 text-[var(--amber)]" />
            策略管理
          </div>
          <p className="panel-copy">配置生成策略、模块顺序、模块角色、模型和 prompt。</p>
        </div>
        <button type="button" className="btn btn-secondary" disabled={busy === "agent-strategy-create"} onClick={() => void onCreateStrategy()}>
          {busy === "agent-strategy-create" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
          新建策略
        </button>
      </div>

      <div className="agent-strategy-layout">
        <div className="agent-strategy-list" aria-label="Agent 策略列表">
          {strategies.map((strategy) => (
            <button
              key={strategy.id}
              type="button"
              className={`agent-strategy-item ${selectedStrategyId === strategy.id ? "agent-strategy-item-active" : ""}`}
              onClick={() => onStrategyChange(strategy.id)}
            >
              <strong>{strategy.name}</strong>
              <span>
                {channelLabel(strategy.targetChannel)} · {strategy.modules.filter((module) => module.enabled).length} 个模块
              </span>
            </button>
          ))}
        </div>

        {editor ? (
          <div className="agent-strategy-editor">
            <div className="agent-strategy-fields">
              <label className="reader-filter-control" htmlFor="agent-strategy-name">
                <span>策略名</span>
                <input id="agent-strategy-name" className="field" value={editor.name} onChange={(event) => patchEditor({ name: event.target.value })} />
              </label>
              <label className="reader-filter-control" htmlFor="agent-strategy-channel">
                <span>平台</span>
                <select
                  id="agent-strategy-channel"
                  className="field"
                  value={editor.targetChannel}
                  onChange={(event) => patchEditor({ targetChannel: event.target.value as ContentChannel })}
                >
                  <option value="wechat">微信公众号</option>
                  <option value="xiaohongshu">小红书</option>
                </select>
              </label>
              <label className="reader-filter-control" htmlFor="agent-strategy-model">
                <span>默认模型</span>
                <input id="agent-strategy-model" className="field" value={editor.defaultModel} placeholder="留空使用系统模型" onChange={(event) => patchEditor({ defaultModel: event.target.value })} />
              </label>
              <label className="reader-filter-control" htmlFor="agent-strategy-status">
                <span>状态</span>
                <select
                  id="agent-strategy-status"
                  className="field"
                  value={editor.status}
                  onChange={(event) => patchEditor({ status: event.target.value === "archived" ? "archived" : "active" })}
                >
                  <option value="active">启用</option>
                  <option value="archived">归档</option>
                </select>
              </label>
            </div>
            <label className="field-label" htmlFor="agent-strategy-description">
              策略说明
            </label>
            <textarea
              id="agent-strategy-description"
              className="textarea agent-strategy-description"
              value={editor.description}
              onChange={(event) => patchEditor({ description: event.target.value })}
            />

            <div className="agent-module-list" aria-label="策略模块">
              {editor.modules.map((module, index) => (
                <article key={module.id} className="agent-module-row">
                  <div className="agent-module-order">
                    <button type="button" className="content-order-button" aria-label={`上移模块：${module.name}`} disabled={index === 0} onClick={() => moveModule(module.id, -1)}>
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <span>{module.order}</span>
                    <button type="button" className="content-order-button" aria-label={`下移模块：${module.name}`} disabled={index === editor.modules.length - 1} onClick={() => moveModule(module.id, 1)}>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="agent-module-main">
                    <div className="agent-module-grid">
                      <label className="reader-filter-control">
                        <span>模块名</span>
                        <input className="field" value={module.name} onChange={(event) => patchModule(module.id, { name: event.target.value })} />
                      </label>
                      <label className="reader-filter-control">
                        <span>角色</span>
                        <select className="field" value={module.role} onChange={(event) => patchModule(module.id, { role: event.target.value as AgentStrategyModuleRole })}>
                          {AGENT_ROLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="reader-filter-control">
                        <span>模型</span>
                        <input className="field" value={module.model} placeholder="留空继承" onChange={(event) => patchModule(module.id, { model: event.target.value })} />
                      </label>
                      <label className="agent-module-toggle">
                        <input type="checkbox" checked={module.enabled} onChange={(event) => patchModule(module.id, { enabled: event.target.checked })} />
                        启用
                      </label>
                    </div>
                    <textarea className="textarea agent-module-prompt" value={module.prompt} onChange={(event) => patchModule(module.id, { prompt: event.target.value })} />
                  </div>
                </article>
              ))}
            </div>

            <div className="agent-panel-actions">
              <button type="button" className="btn btn-secondary" onClick={addModule}>
                <Pencil className="h-4 w-4" />
                添加模块
              </button>
              <button type="button" className="btn btn-primary" disabled={busy === `agent-strategy-${editor.id}`} onClick={() => void onStrategySave(editor)}>
                {busy === `agent-strategy-${editor.id}` ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存策略
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-list">
            <div className="empty-list-title">暂无策略</div>
            <p>新建一个策略后再运行 Agent。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function AgentGenerationPanel({
  articles,
  busy,
  onGenerate,
  onReferenceToggle,
  onStrategyChange,
  onTopicChange,
  selectedArticleIds,
  selectedStrategyId,
  strategies,
  topic,
}: {
  articles: Article[];
  busy: string | null;
  onGenerate: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onReferenceToggle: (articleId: string) => void;
  onStrategyChange: (strategyId: string) => void;
  onTopicChange: (topic: string) => void;
  selectedArticleIds: string[];
  selectedStrategyId: string;
  strategies: AgentStrategy[];
  topic: string;
}) {
  const selectedSet = useMemo(() => new Set(selectedArticleIds), [selectedArticleIds]);
  const referenceArticles = useMemo(() => {
    const selected = articles.filter((article) => selectedSet.has(article.id));
    const rest = articles.filter((article) => !selectedSet.has(article.id));
    return [...selected, ...rest].slice(0, 14);
  }, [articles, selectedSet]);

  return (
    <section className="panel agent-generate-panel" aria-label="生成工作台">
      <div className="wechat-section-heading">
        <div>
          <div className="panel-title">
            <Sparkles className="h-4 w-4 text-[var(--green)]" />
            生成工作台
          </div>
          <p className="panel-copy">选择策略、选题和引用知识库文章，生成结果先进入 Agent 草稿池。</p>
        </div>
      </div>

      <form className="wechat-writing-form" onSubmit={(event) => void onGenerate(event)}>
        <div className="writing-strategy-grid">
          <label className="reader-filter-control writing-topic-field" htmlFor="agent-topic">
            <span>选题</span>
            <input id="agent-topic" value={topic} onChange={(event) => onTopicChange(event.target.value)} placeholder="例如：OpenAI 大神教你如何榨干 Codex" className="field" />
          </label>
          <label className="reader-filter-control" htmlFor="agent-strategy-select">
            <span>策略</span>
            <select id="agent-strategy-select" value={selectedStrategyId} onChange={(event) => onStrategyChange(event.target.value)} className="field">
              {strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary writing-generate-submit" disabled={busy === "agent-generate" || selectedArticleIds.length === 0}>
            {busy === "agent-generate" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy === "agent-generate" ? "Agent 生成中" : "运行 Agent"}
          </button>
        </div>

        <div className="wechat-reference-list" aria-label="引用知识库文章选择">
          {referenceArticles.map((article) => (
            <label key={article.id} className="wechat-reference-option">
              <input type="checkbox" checked={selectedSet.has(article.id)} onChange={() => onReferenceToggle(article.id)} />
              <span>
                <strong>{article.title}</strong>
                <small>
                  {articleSourceProject(article)} · {articleCategory(article)}
                </small>
              </span>
            </label>
          ))}
          {articles.length === 0 ? <p className="panel-copy">引用知识库为空，先录入文章后再生成。</p> : null}
        </div>
      </form>
    </section>
  );
}

function AgentDraftPool({
  busy,
  draftEditor,
  drafts,
  onEditorChange,
  onPushLocal,
  onPushWechat,
  onSave,
  onSelect,
  selectedDraft,
  selectedDraftId,
}: {
  busy: string | null;
  draftEditor: AgentDraftEditorState;
  drafts: AgentDraft[];
  onEditorChange: (patch: Partial<AgentDraftEditorState>) => void;
  onPushLocal: (draft: AgentDraft) => void | Promise<void>;
  onPushWechat: (draft: AgentDraft) => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onSelect: (draftId: string) => void;
  selectedDraft: AgentDraft | null;
  selectedDraftId: string;
}) {
  return (
    <section className="panel agent-draft-pool" aria-label="Agent 草稿池">
      <div className="wechat-section-heading">
        <div>
          <div className="panel-title">
            <FileText className="h-4 w-4 text-[var(--blue)]" />
            Agent 草稿池
          </div>
          <p className="panel-copy">Agent 生成稿独立保存，确认后再推到公众号管理或微信后台。</p>
        </div>
        <span className="agent-status-pill agent-status-pill-ready">{drafts.length} 篇</span>
      </div>

      <div className="agent-draft-shell">
        <div className="content-draft-list agent-draft-list" aria-label="Agent 草稿列表">
          {drafts.map((draft) => (
            <article key={draft.id} className={`content-draft-item ${selectedDraftId === draft.id ? "content-draft-item-active" : ""}`}>
              <button type="button" className="content-draft-item-main" aria-pressed={selectedDraftId === draft.id} onClick={() => onSelect(draft.id)}>
                <span className="content-queue-title">{draft.title}</span>
                <span className="content-queue-preview">{stripPreviewHtml(draft.bodyHtml).slice(0, 160) || "暂无正文"}</span>
                <span className="content-queue-meta">
                  <span className="content-draft-status-pill">{agentDraftStatusLabel(draft.status)}</span>
                  <span>{draft.strategySnapshot.name}</span>
                  <span>{formatDateTime(draft.updatedAt)}</span>
                </span>
              </button>
            </article>
          ))}
          {drafts.length === 0 ? (
            <div className="empty-list">
              <div className="empty-list-title">暂无 Agent 草稿</div>
              <p>运行一次 Agent 后，生成稿会先出现在这里。</p>
            </div>
          ) : null}
        </div>

        <div className="content-draft-editor agent-draft-editor" aria-label="Agent 草稿编辑区">
          {selectedDraft ? (
            <>
              <label className="field-label" htmlFor="agent-draft-title">
                标题
              </label>
              <input id="agent-draft-title" className="field" value={draftEditor.title} onChange={(event) => onEditorChange({ title: event.target.value })} />

              <div className="content-draft-controls">
                <label className="field-label" htmlFor="agent-draft-status">
                  状态
                </label>
                <select id="agent-draft-status" className="field" value={draftEditor.status} onChange={(event) => onEditorChange({ status: event.target.value as AgentDraftStatus })}>
                  <option value="generated">已生成</option>
                  <option value="editing">编辑中</option>
                  <option value="approved">已确认</option>
                  <option value="pushed_local">已推本地</option>
                  <option value="pushed_wechat">已推微信</option>
                  <option value="failed">失败</option>
                  <option value="archived">归档</option>
                </select>
                <span className="tiny-meta">
                  审稿 {selectedDraft.review?.score ?? "未评分"} · 复用提醒 {selectedDraft.warnings.length}
                </span>
              </div>

              <label className="field-label" htmlFor="agent-draft-body">
                正文
              </label>
              <textarea id="agent-draft-body" className="textarea content-draft-body-field" value={draftEditor.bodyHtml} onChange={(event) => onEditorChange({ bodyHtml: event.target.value })} />

              <div className="content-draft-editor-actions">
                <button type="button" className="btn btn-primary" disabled={busy === `agent-draft-edit-${selectedDraft.id}`} onClick={() => void onSave()}>
                  {busy === `agent-draft-edit-${selectedDraft.id}` ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存 Agent 草稿
                </button>
                <button type="button" className="btn btn-secondary" disabled={busy === `agent-push-local-${selectedDraft.id}`} onClick={() => void onPushLocal(selectedDraft)}>
                  {busy === `agent-push-local-${selectedDraft.id}` ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  推到本地公众号管理
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={selectedDraft.targetChannel !== "wechat" || busy === `agent-push-wechat-${selectedDraft.id}`}
                  onClick={() => void onPushWechat(selectedDraft)}
                >
                  {busy === `agent-push-wechat-${selectedDraft.id}` ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  直接推微信后台
                </button>
              </div>

              {selectedDraft.review?.revisionSummary || selectedDraft.error || selectedDraft.warnings.length > 0 ? (
                <div className="editorial-result-panel" aria-label="Agent 审稿结果">
                  {selectedDraft.review?.revisionSummary ? <p className="panel-copy">审稿：{selectedDraft.review.revisionSummary}</p> : null}
                  {selectedDraft.error ? <p className="panel-copy">错误：{selectedDraft.error}</p> : null}
                  {selectedDraft.warnings.length > 0 ? (
                    <div className="warning-list">
                      <strong>长句复用提醒</strong>
                      {selectedDraft.warnings.slice(0, 3).map((warning) => (
                        <p key={`${warning.sourceArticleId}-${warning.matchedText.slice(0, 12)}`}>
                          {warning.sourceTitle}：{warning.matchedText}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <section className="content-draft-preview-panel" aria-label="Agent 草稿正文预览">
                <div className="metric-line">
                  <span className="field-label">正文预览</span>
                  <span className="tiny-meta">{stripPreviewHtml(draftEditor.bodyHtml).length} 字</span>
                </div>
                <div className="content-draft-readable">
                  <ReadableContent content={draftEditor.bodyHtml || "暂无正文"} />
                </div>
              </section>
            </>
          ) : (
            <div className="empty-list">
              <div className="empty-list-title">请选择一个 Agent 草稿</div>
              <p>草稿池里的内容不会自动进入公众号管理。</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function XiaohongshuPlaceholder() {
  return (
    <section className="panel xiaohongshu-placeholder" aria-label="小红书工作台">
      <div className="panel-title">
        <FileText className="h-4 w-4 text-[var(--red)]" />
        小红书
      </div>
      <p className="panel-copy">入口已保留，当前重构不接入 Agent。</p>
    </section>
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

function firstDraftForChannel(drafts: LocalDraft[], channel: ContentChannel, filter: DraftBoardFilter): LocalDraft | null {
  return drafts
    .filter((draft) => draftChannel(draft) === channel && draftMatchesBoardFilter(draft, filter))
    .sort(compareDraftQueue)[0] ?? null;
}

function draftMatchesBoardFilter(draft: LocalDraft, filter: DraftBoardFilter): boolean {
  return filter === "all" || draftStatus(draft) === filter;
}

function draftToEditorState(draft: LocalDraft | null | undefined): DraftEditorState {
  return {
    title: draft?.title ?? "",
    body: draft?.body ?? "",
    notes: draft?.notes ?? "",
    publishStatus: draft ? draftStatus(draft) : "draft",
    plannedPublishAt: toDateTimeLocalValue(draft?.plannedPublishAt),
  };
}

function agentDraftToEditorState(draft: AgentDraft | null | undefined): AgentDraftEditorState {
  return {
    title: draft?.title ?? "",
    bodyHtml: draft?.bodyHtml ?? "",
    status: draft?.status ?? "generated",
  };
}

function draftStatus(draft: LocalDraft): PublishStatus {
  return draft.publishStatus === "queued" || draft.publishStatus === "published" || draft.publishStatus === "archived"
    ? draft.publishStatus
    : "draft";
}

function cloneAgentStrategy(strategy: AgentStrategy | null | undefined): AgentStrategy | null {
  return strategy
    ? {
        ...strategy,
        modules: strategy.modules.map((module) => ({ ...module })),
      }
    : null;
}

function channelLabel(channel: ContentChannel): string {
  return channel === "xiaohongshu" ? "小红书" : "微信公众号";
}

function localArticleCollectionLabel(channel: ContentChannel): string {
  return channel === "xiaohongshu" ? "小红书工作台" : "微信公众号工作台";
}

function workspaceKickerLabel(workspace: Workspace, channel: ContentChannel): string {
  if (workspace === "library") {
    return "引用知识库";
  }
  if (workspace === "agent") {
    return "Agent 编辑部";
  }
  return channelLabel(channel);
}

function workspaceTitleLabel(workspace: Workspace, channel: ContentChannel): string {
  if (workspace === "agent") {
    return "Agent 工作台";
  }
  if (workspace === "xiaohongshu") {
    return "小红书";
  }
  return localArticleCollectionLabel(channel);
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

function agentDraftStatusLabel(status: AgentDraftStatus): string {
  if (status === "editing") {
    return "编辑中";
  }
  if (status === "approved") {
    return "已确认";
  }
  if (status === "pushed_local") {
    return "已推本地";
  }
  if (status === "pushed_wechat") {
    return "已推微信";
  }
  if (status === "failed") {
    return "失败";
  }
  if (status === "archived") {
    return "归档";
  }
  return "已生成";
}

function agentRoleLabel(role: AgentStrategyModuleRole): string {
  return AGENT_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? "自定义";
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

function buildWeChatSyncStats(drafts: LocalDraft[]): Record<LocalDraft["wechatDraftStatus"], number> {
  const stats: Record<LocalDraft["wechatDraftStatus"], number> = {
    not_sent: 0,
    sent: 0,
    failed: 0,
  };
  for (const draft of drafts) {
    const status = draft.wechatDraftStatus === "sent" || draft.wechatDraftStatus === "failed" ? draft.wechatDraftStatus : "not_sent";
    stats[status] += 1;
  }
  return stats;
}

function draftTimelineLabel(draft: LocalDraft): string {
  if (draftStatus(draft) === "published" && draft.publishedAt) {
    return `发布 ${formatDateTime(draft.publishedAt)}`;
  }
  if (draft.plannedPublishAt) {
    return `计划 ${formatDateTime(draft.plannedPublishAt)}`;
  }
  return "未排期";
}

function wechatDraftStatusLabel(status: LocalDraft["wechatDraftStatus"], channel: ContentChannel): string {
  if (channel === "xiaohongshu") {
    if (status === "failed") {
      return "平台同步失败";
    }
    if (status === "sent") {
      return "已同步平台草稿";
    }
    return "未同步平台";
  }
  if (status === "failed") {
    return "微信草稿箱失败";
  }
  if (status === "sent") {
    return "已进微信草稿箱";
  }
  return "未推送微信草稿箱";
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
    sortableDraftOrder(left) - sortableDraftOrder(right) ||
    compareDateDesc(left.updatedAt, right.updatedAt)
  );
}

function effectiveDraftOrder(draft: LocalDraft, index: number): number {
  return typeof draft.queueOrder === "number" && Number.isFinite(draft.queueOrder) && draft.queueOrder > 0 ? draft.queueOrder : index + 1;
}

function displayDraftOrder(draft: LocalDraft, index: number): number {
  return effectiveDraftOrder(draft, index);
}

function sortableDraftOrder(draft: LocalDraft): number {
  return typeof draft.queueOrder === "number" && Number.isFinite(draft.queueOrder) && draft.queueOrder > 0 ? draft.queueOrder : Number.MAX_SAFE_INTEGER;
}

function draftPreviewText(draft: LocalDraft): string {
  const preview = stripPreviewHtml(draft.body);
  const title = draft.title.trim();
  if (!title || !preview.startsWith(title)) {
    return preview;
  }
  return preview.slice(title.length).replace(/^[\s:：｜|,，。-]+/, "").trim() || preview;
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

function upsertAgentDraft(current: AgentDraft[], draft: AgentDraft): AgentDraft[] {
  const existing = current.some((item) => item.id === draft.id);
  const next = existing ? current.map((item) => (item.id === draft.id ? draft : item)) : [draft, ...current];
  return next.sort((left, right) => compareDateDesc(left.updatedAt, right.updatedAt));
}

function upsertAgentStrategy(current: AgentStrategy[], strategy: AgentStrategy): AgentStrategy[] {
  const existing = current.some((item) => item.id === strategy.id);
  const next = existing ? current.map((item) => (item.id === strategy.id ? strategy : item)) : [strategy, ...current];
  return next.sort((left, right) => compareDateDesc(left.updatedAt, right.updatedAt));
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
const AGENT_ROLE_OPTIONS: Array<{ value: AgentStrategyModuleRole; label: string }> = [
  { value: "editor_in_chief", label: "主编" },
  { value: "technical_brief", label: "技术骨架" },
  { value: "opening", label: "开头" },
  { value: "pacing", label: "节奏" },
  { value: "layout", label: "排版" },
  { value: "image", label: "图片插入" },
  { value: "checklist", label: "可收藏清单" },
  { value: "review", label: "审稿" },
  { value: "writer", label: "主笔" },
  { value: "custom", label: "自定义" },
];
const EDITABLE_TAIL_MARKER_PATTERN =
  /(?:一键三连|小心心|欢迎在评论区|评论区留下|点亮星标|科技前沿进展每日见|—\s*完\s*—|全文完|好文推荐|相关推荐)/i;
const EDITABLE_ENGAGEMENT_TAIL_MARKER_PATTERN = /(?:点赞.{0,32}转发|转发.{0,32}点赞)/i;
const EDITABLE_END_TAIL_MARKER_PATTERN = /\bEND\b/;
