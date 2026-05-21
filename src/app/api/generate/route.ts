import { z } from "zod";
import { errorJson, stores } from "@/app/api/_helpers";
import {
  DEFAULT_WECHAT_GENERATE_OPTIONS,
  generateWeChatArticle,
  type WeChatGenerateInput,
} from "@/lib/wechat-generator";

export const runtime = "nodejs";

const requestSchema = z.object({
  title: z.string().trim().min(1, "请输入标题").max(60, "标题请控制在 60 个字以内"),
  mode: z.enum(["keep-title", "new-title"]).default("new-title"),
  articleType: z.enum(["share", "guide", "tutorial", "commerce", "review", "insight", "free"]).default("share"),
  length: z.enum(["short", "medium", "long", "xlong", "free"]).default("xlong"),
  brief: z.string().default(""),
  audience: z.string().default(""),
  persona: z.string().default(""),
  referenceNotes: z.string().default(""),
  options: z
    .object({
      quoteTitle: z.boolean().optional(),
      addEmoji: z.boolean().optional(),
      addHashtags: z.boolean().optional(),
      filterSensitiveWords: z.boolean().optional(),
      filterMarketingWords: z.boolean().optional(),
    })
    .default({}),
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json().catch(() => ({})));
    const input: WeChatGenerateInput = {
      ...payload,
      options: {
        ...DEFAULT_WECHAT_GENERATE_OPTIONS,
        ...payload.options,
      },
    };

    const { draftStore, settingsStore } = stores();
    const article = await generateWeChatArticle(input, await settingsStore.getAiSettings());
    const draft = await draftStore.createDraft({
      title: article.title,
      body: article.bodyHtml,
      sourceAnalysisIds: [],
      exportFormat: "html",
    });

    return Response.json({ article, draft });
  } catch (error) {
    return errorJson(error);
  }
}
