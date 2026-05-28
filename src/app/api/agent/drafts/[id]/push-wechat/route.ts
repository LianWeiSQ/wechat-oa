import { errorJson, stores } from "@/app/api/_helpers";
import { pushDraftToWeChat } from "@/lib/wechat";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { agentStore, draftStore, settingsStore } = stores();
    const agentDraft = await agentStore.getDraft(id);
    if (!agentDraft) {
      return Response.json({ error: "Agent 草稿不存在" }, { status: 404 });
    }
    if (agentDraft.targetChannel !== "wechat") {
      return Response.json({ error: "当前草稿不是微信公众号内容，不能直推微信后台" }, { status: 400 });
    }

    let localDraft = agentDraft.localDraftId ? await draftStore.getDraft(agentDraft.localDraftId) : null;
    if (!localDraft) {
      localDraft = await draftStore.createDraft({
        title: agentDraft.title,
        body: agentDraft.bodyHtml,
        sourceAnalysisIds: [],
        sourceArticleIds: agentDraft.sourceArticleIds,
        contentChannel: "wechat",
        publishStatus: "draft",
        notes: `Agent 草稿直推微信后台前自动生成的本地副本：${agentDraft.strategySnapshot.name}`,
        exportFormat: "html",
      });
    }

    const result = await pushDraftToWeChat(localDraft, await settingsStore.getWeChatConfig());
    const savedLocalDraft = await draftStore.markWeChatResult(localDraft.id, result.ok ? "sent" : "failed", result.mediaId);
    const updatedAgentDraft = await agentStore.updateDraft(agentDraft.id, {
      localDraftId: localDraft.id,
      wechatMediaId: result.mediaId,
      status: result.ok ? "pushed_wechat" : "failed",
      error: result.ok ? "" : result.message,
    });
    return Response.json(
      {
        ...result,
        agentDraft: updatedAgentDraft ?? agentDraft,
        draft: savedLocalDraft ?? localDraft,
      },
      { status: result.ok ? 200 : 422 },
    );
  } catch (error) {
    return errorJson(error);
  }
}
