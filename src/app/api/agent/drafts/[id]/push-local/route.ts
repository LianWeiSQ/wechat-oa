import { errorJson, stores } from "@/app/api/_helpers";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { agentStore, draftStore } = stores();
    const agentDraft = await agentStore.getDraft(id);
    if (!agentDraft) {
      return Response.json({ error: "Agent 草稿不存在" }, { status: 404 });
    }

    const existingLocalDraft = agentDraft.localDraftId ? await draftStore.getDraft(agentDraft.localDraftId) : null;
    if (existingLocalDraft) {
      return Response.json({ agentDraft, draft: existingLocalDraft, alreadyPushed: true });
    }

    const draft = await draftStore.createDraft({
      title: agentDraft.title,
      body: agentDraft.bodyHtml,
      sourceAnalysisIds: [],
      sourceArticleIds: agentDraft.sourceArticleIds,
      contentChannel: agentDraft.targetChannel,
      publishStatus: "draft",
      notes: `来自 Agent 草稿池：${agentDraft.strategySnapshot.name}。选题：${agentDraft.topic}`,
      exportFormat: "html",
    });
    const updatedAgentDraft = await agentStore.updateDraft(agentDraft.id, {
      localDraftId: draft.id,
      status: "pushed_local",
      error: "",
    });
    return Response.json({ agentDraft: updatedAgentDraft ?? agentDraft, draft });
  } catch (error) {
    return errorJson(error);
  }
}
