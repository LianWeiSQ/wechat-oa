export type ArticleSourceType = "web" | "wechat" | "manual";

export type Article = {
  id: string;
  title: string;
  sourceType: ArticleSourceType;
  sourceName: string;
  /** @deprecated Use sourceName. Kept for compatibility with existing local data and code paths. */
  sourceAccount: string;
  originalUrl: string;
  author: string;
  publishedAt: string;
  contentHtml: string;
  contentText: string;
  /** @deprecated Use contentHtml/contentText. Kept for compatibility with existing local data and code paths. */
  content: string;
  category: string;
  isFavorite: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type ArticleInput = {
  title: string;
  sourceType?: ArticleSourceType;
  sourceName?: string;
  sourceAccount?: string;
  originalUrl?: string;
  author?: string;
  publishedAt?: string;
  contentHtml?: string;
  contentText?: string;
  content?: string;
  category?: string;
  isFavorite?: boolean;
  tags?: string[];
};

export type ArticleParseRun = {
  id: string;
  articleId?: string;
  url: string;
  status: "parsed" | "fallback" | "failed";
  strategy: "wechat" | "generic-web" | "manual";
  qualityScore: number;
  metadata: {
    title?: string;
    sourceName?: string;
    author?: string;
    publishedAt?: string;
    wordCount?: number;
  };
  fallbackReason: string;
  createdAt: string;
};

export type AnalysisTemplate = {
  id: string;
  name: string;
  lens: string;
  prompt: string;
  scoringRubric: string[];
  enabled: boolean;
};

export type ViralScore = {
  total: number;
  dimensions: {
    pain: number;
    novelty: number;
    evidence: number;
    debate: number;
  };
  reasons: string[];
};

export type TopicCandidate = {
  id?: string;
  analysisRunId?: string;
  title: string;
  hook: string;
  targetReader: string;
  angle: string;
  evidenceArticleIds?: string[];
  viralScore: number;
  status?: "new" | "selected" | "drafted" | "archived";
  createdAt?: string;
  updatedAt?: string;
};

export type AnalysisRun = {
  id: string;
  articleId: string;
  templateId: string;
  templateName: string;
  lens: string;
  summary: string;
  technicalInsights: string[];
  risks: string[];
  reusableAngles: string[];
  viralScore: ViralScore;
  topicCandidates: TopicCandidate[];
  modelMetadata: {
    provider: string;
    model: string;
  };
  createdAt: string;
};

export type ContentAgentStep = {
  name: string;
  status: "ok" | "warning" | "error";
  message: string;
};

export type ContentAgentRun = {
  id: string;
  articleId: string;
  status: "completed" | "failed";
  steps: ContentAgentStep[];
  articleType: "technical-deep-dive" | "news-analysis" | "product-release" | "case-study" | "opinion" | "unknown";
  qualityScore: number;
  recommendedTemplateIds: string[];
  recommendedAction: "analyze" | "generate-draft" | "supplement" | "archive";
  reasoningSummary: string;
  createdAt: string;
};

export type LocalDraft = {
  id: string;
  title: string;
  body: string;
  sourceAnalysisIds: string[];
  exportFormat: "markdown" | "html";
  wechatDraftStatus: "not_sent" | "sent" | "failed";
  wechatMediaId?: string;
  createdAt: string;
  updatedAt: string;
};

export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";

export type ImageSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
  size: ImageSize;
};

export type PublicImageSettings = Omit<ImageSettings, "apiKey"> & {
  hasApiKey: boolean;
};

export type DraftImageAsset = {
  id: string;
  draftId: string;
  role: "hero" | "explanation";
  status: "pending" | "generated" | "failed";
  localPath: string;
  publicPath: string;
  prompt: string;
  revisedPrompt: string;
  alt: string;
  caption: string;
  model: string;
  size: ImageSize;
  error: string;
  createdAt: string;
  updatedAt: string;
};

export type AssetKind = "image";

export type AssetSourceType = "imported-article" | "generated-draft";

export type AssetStatus = "uploading" | "stored" | "failed";

export type Asset = {
  id: string;
  workspaceId: string;
  kind: AssetKind;
  sourceType: AssetSourceType;
  status: AssetStatus;
  originalUrl: string;
  objectKey: string;
  publicPath: string;
  sha256: string;
  mimeType: string;
  byteSize: number;
  width?: number;
  height?: number;
  prompt: string;
  revisedPrompt: string;
  alt: string;
  caption: string;
  model: string;
  error: string;
  createdAt: string;
  updatedAt: string;
};

export type AssetLink = {
  id: string;
  workspaceId: string;
  assetId: string;
  targetType: "article" | "draft" | "analysis_run";
  targetId: string;
  role: "source-image" | "hero" | "explanation";
  sortOrder: number;
  caption: string;
  createdAt: string;
};

export type ProfessionalImageBrief = {
  role: DraftImageAsset["role"];
  prompt: string;
  alt: string;
  caption: string;
};

export type ProfessionalArticleDraft = {
  title: string;
  deck: string;
  bodyHtml: string;
  pullQuotes: string[];
  imageBriefs: ProfessionalImageBrief[];
};

export type WritingStructure = {
  titlePattern: string;
  openingHook: string;
  pressurePoint: string;
  ethicalRewrite: string;
  technicalBackbone: string[];
  evidencePattern: string[];
  pacingPattern: string;
  reusableMoves: string[];
  antiPatterns: string[];
};

export type WritingStructureRun = {
  id: string;
  articleId: string;
  structure: WritingStructure;
  qualityScore: number;
  modelMetadata: {
    provider: string;
    model: string;
  };
  createdAt: string;
};

export type WritingBlueprintSection = {
  title: string;
  purpose: string;
  guidance: string;
};

export type WritingBlueprint = {
  id: string;
  name: string;
  sourceArticleIds: string[];
  summary: string;
  sectionPlan: WritingBlueprintSection[];
  toneRules: string[];
  bannedExpressions: string[];
  modelMetadata: {
    provider: string;
    model: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type SourceReuseWarning = {
  sourceArticleId: string;
  sourceTitle: string;
  matchedText: string;
};

export type EditorialScore = {
  total: number;
  topic: number;
  readerFit: number;
  opening: number;
  viewpoint: number;
  evidence: number;
  pacing: number;
  wechatReadability: number;
  originality: number;
  notes: string[];
  revisionPriority: string[];
};

export type WritingTechnicalBriefSection = {
  title: string;
  mustSay: string[];
  evidence: string[];
  avoid: string[];
};

export type WritingTechnicalBrief = {
  targetReader: string;
  topicJudgment: string;
  coreClaim: string;
  verifiedFacts: string[];
  sourceBoundaries: string[];
  sectionBrief: WritingTechnicalBriefSection[];
  riskFlags: string[];
  styleInstructions: string[];
};

export type OriginalArticleDraft = {
  title: string;
  deck: string;
  bodyHtml: string;
  readerProfile?: string;
  coreClaim?: string;
  titleOptions?: string[];
  editorialScore?: EditorialScore;
};

export type DraftReview = {
  score: number;
  passed: boolean;
  factIssues: string[];
  fakeSceneIssues: string[];
  ctaIssues: string[];
  styleIssues: string[];
  compressionNotes: string[];
  revisionSummary: string;
  revisedDraft?: OriginalArticleDraft;
};

export type AiWireApi = "chat-completions" | "responses";

export type AiReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type AiSettings = {
  modelProvider?: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  reviewModel?: string;
  reviewModelProvider?: string;
  reviewBaseUrl?: string;
  reviewApiKey?: string;
  reviewWireApi?: AiWireApi;
  reviewReasoningEffort?: AiReasoningEffort;
  wireApi?: AiWireApi;
  reasoningEffort?: AiReasoningEffort;
  disableResponseStorage?: boolean;
};

export type WeChatConfig = {
  appId: string;
  appSecret: string;
  defaultThumbMediaId?: string;
  tokenStatus: "unchecked" | "ok" | "error";
  lastCheckResult: string;
  updatedAt: string;
};

export type PublicWeChatConfig = Omit<WeChatConfig, "appSecret"> & {
  hasAppSecret: boolean;
};
