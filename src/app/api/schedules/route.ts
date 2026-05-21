import { z } from "zod";
import { errorJson, stores } from "@/app/api/_helpers";
import {
  DEFAULT_WECHAT_GENERATE_OPTIONS,
  type WeChatGenerateInput,
} from "@/lib/wechat-generator";

export const runtime = "nodejs";

const taskSchema = z.object({
  name: z.string().default(""),
  scheduleType: z.enum(["once", "daily", "weekly"]).default("once"),
  scheduledAt: z.string().min(1, "请选择定时生成时间"),
  input: z.object({
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
  }),
});

export async function GET() {
  const { scheduleStore } = stores();
  return Response.json({ tasks: await scheduleStore.listTasksWithRuns() });
}

export async function POST(request: Request) {
  try {
    const payload = taskSchema.parse(await request.json().catch(() => ({})));
    const input: WeChatGenerateInput = {
      ...payload.input,
      options: {
        ...DEFAULT_WECHAT_GENERATE_OPTIONS,
        ...payload.input.options,
      },
    };
    const { scheduleStore } = stores();
    const task = await scheduleStore.createTask({
      name: payload.name,
      scheduleType: payload.scheduleType,
      scheduledAt: payload.scheduledAt,
      input,
    });
    return Response.json({ task });
  } catch (error) {
    return errorJson(error);
  }
}
