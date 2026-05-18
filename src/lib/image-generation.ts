import { storeGeneratedImage } from "@/lib/image-storage";
import { createId } from "@/lib/ids";
import type { DraftImageAsset, ImageSettings, ProfessionalImageBrief } from "@/lib/types";

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type GenerateDraftImageInput = ProfessionalImageBrief & {
  draftId: string;
  settings: ImageSettings;
  outputDir?: string;
  fetcher?: Fetcher;
};

export type DraftImageAssetInput = Omit<DraftImageAsset, "id" | "createdAt" | "updatedAt">;

export async function generateDraftImage(input: GenerateDraftImageInput): Promise<DraftImageAssetInput> {
  const settings = input.settings;
  if (!settings.apiKey.trim()) {
    return failedAsset(input, "请先配置图片 API Key");
  }

  try {
    const baseUrl = settings.baseUrl.trim() || "https://api.openai.com/v1";
    const response = await (input.fetcher ?? fetch)(`${baseUrl.replace(/\/$/, "")}/images/generations`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${settings.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: settings.model,
        prompt: input.prompt,
        size: settings.size,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return failedAsset(input, `图片生成失败：${response.status} ${text.slice(0, 160)}`);
    }

    const data = await response.json();
    const image = data?.data?.[0];
    const b64Json = image?.b64_json;
    if (typeof b64Json !== "string" || b64Json.length === 0) {
      return failedAsset(input, "图片接口没有返回 b64_json");
    }

    const fileName = safeImageFileName(input.draftId, input.role);
    const storedImage = await storeGeneratedImage({
      fileName,
      bytes: Buffer.from(b64Json, "base64"),
      outputDir: input.outputDir,
      mimeType: "image/png",
    });

    return {
      draftId: input.draftId,
      role: input.role,
      status: "generated",
      localPath: storedImage.localPath,
      publicPath: storedImage.publicPath,
      prompt: input.prompt,
      revisedPrompt: typeof image?.revised_prompt === "string" ? image.revised_prompt : "",
      alt: input.alt,
      caption: input.caption,
      model: settings.model,
      size: settings.size,
      error: "",
    };
  } catch (error) {
    return failedAsset(input, error instanceof Error ? error.message : String(error));
  }
}

function failedAsset(input: GenerateDraftImageInput, error: string): DraftImageAssetInput {
  return {
    draftId: input.draftId,
    role: input.role,
    status: "failed",
    localPath: "",
    publicPath: "",
    prompt: input.prompt,
    revisedPrompt: "",
    alt: input.alt,
    caption: input.caption,
    model: input.settings.model,
    size: input.settings.size,
    error,
  };
}

function safeImageFileName(draftId: string, role: DraftImageAsset["role"]): string {
  const safeDraftId = draftId.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `${safeDraftId}-${role}-${createId("asset")}.png`;
}
