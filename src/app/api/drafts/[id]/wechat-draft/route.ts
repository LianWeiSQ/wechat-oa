import { stores, errorJson } from "@/app/api/_helpers";
import { pushDraftToWeChat } from "@/lib/wechat";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { draftStore, settingsStore } = stores();
    const draft = await draftStore.getDraft(id);
    if (!draft) {
      return Response.json({ error: "草稿不存在" }, { status: 404 });
    }
    const result = await pushDraftToWeChat(draft, await settingsStore.getWeChatConfig());
    const saved = await draftStore.markWeChatResult(id, result.ok ? "sent" : "failed", result.mediaId);
    return Response.json({ ...result, draft: saved }, { status: result.ok ? 200 : 422 });
  } catch (error) {
    return errorJson(error);
  }
}
