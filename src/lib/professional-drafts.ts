import { generateProfessionalArticleDraft } from "@/lib/article-writer";
import type { DraftImageAssetInput, GenerateDraftImageInput } from "@/lib/image-generation";
import { generateDraftImage } from "@/lib/image-generation";
import type {
  AiSettings,
  AnalysisRun,
  Article,
  DraftImageAsset,
  ImageSettings,
  LocalDraft,
  ProfessionalArticleDraft,
  ProfessionalImageBrief,
} from "@/lib/types";

type DraftStore = {
  createDraft(input: Pick<LocalDraft, "title" | "body" | "sourceAnalysisIds" | "exportFormat">): LocalDraft | Promise<LocalDraft>;
  updateDraftBody(id: string, body: string): LocalDraft | null | Promise<LocalDraft | null>;
};

type DraftImageStore = {
  createAsset(input: DraftImageAssetInput): DraftImageAsset | Promise<DraftImageAsset>;
};

type Writer = (
  article: Article,
  run: AnalysisRun,
  settings: AiSettings,
) => Promise<ProfessionalArticleDraft>;

type ImageGenerator = (input: GenerateDraftImageInput) => Promise<DraftImageAssetInput>;

export async function createProfessionalDraftWithImages(input: {
  article: Article;
  analysisRun: AnalysisRun;
  aiSettings: AiSettings;
  imageSettings: ImageSettings;
  draftStore: DraftStore;
  draftImageStore: DraftImageStore;
  writer?: Writer;
  imageGenerator?: ImageGenerator;
}): Promise<{
  draft: LocalDraft;
  professionalDraft: ProfessionalArticleDraft;
  imageAssets: DraftImageAsset[];
}> {
  const writer = input.writer ?? generateProfessionalArticleDraft;
  const imageGenerator = input.imageGenerator ?? generateDraftImage;
  const professionalDraft = await writer(input.article, input.analysisRun, input.aiSettings);
  let draft = await input.draftStore.createDraft({
    title: professionalDraft.title,
    body: professionalDraft.bodyHtml,
    sourceAnalysisIds: [input.analysisRun.id],
    exportFormat: "html",
  });

  const imageAssets: DraftImageAsset[] = [];
  for (const brief of professionalDraft.imageBriefs.slice(0, 2)) {
    const assetInput = await generateImageAsset({
      brief,
      draftId: draft.id,
      imageSettings: input.imageSettings,
      imageGenerator,
    });
    imageAssets.push(await input.draftImageStore.createAsset(assetInput));
  }

  const updated = await input.draftStore.updateDraftBody(
    draft.id,
    renderDraftBodyWithImages(professionalDraft.bodyHtml, imageAssets),
  );
  draft = updated ?? draft;

  return {
    draft,
    professionalDraft,
    imageAssets,
  };
}

export function renderDraftBodyWithImages(bodyHtml: string, imageAssets: DraftImageAsset[]): string {
  const imageHtml = imageAssets.map(renderImageAsset).join("\n");
  if (!imageHtml) {
    return bodyHtml;
  }
  return [bodyHtml.trim(), `<section data-generated-images="true">`, imageHtml, `</section>`].join("\n");
}

async function generateImageAsset(input: {
  brief: ProfessionalImageBrief;
  draftId: string;
  imageSettings: ImageSettings;
  imageGenerator: ImageGenerator;
}): Promise<DraftImageAssetInput> {
  try {
    return await input.imageGenerator({
      ...input.brief,
      draftId: input.draftId,
      settings: input.imageSettings,
    });
  } catch (error) {
    return {
      draftId: input.draftId,
      role: input.brief.role,
      status: "failed",
      localPath: "",
      publicPath: "",
      prompt: input.brief.prompt,
      revisedPrompt: "",
      alt: input.brief.alt,
      caption: input.brief.caption,
      model: input.imageSettings.model,
      size: input.imageSettings.size,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function renderImageAsset(asset: DraftImageAsset): string {
  if (asset.status === "generated" && asset.publicPath) {
    return [
      `<figure data-image-role="${escapeAttribute(asset.role)}">`,
      `<img src="${escapeAttribute(asset.publicPath)}" alt="${escapeAttribute(asset.alt)}" />`,
      asset.caption ? `<figcaption>${escapeHtml(asset.caption)}</figcaption>` : "",
      `</figure>`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `<aside data-image-role="${escapeAttribute(asset.role)}" data-image-status="failed">`,
    `<p><strong>配图生成失败：</strong>${escapeHtml(asset.error || "未知错误")}</p>`,
    `<p><strong>可重试 prompt：</strong>${escapeHtml(asset.prompt)}</p>`,
    `</aside>`,
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
