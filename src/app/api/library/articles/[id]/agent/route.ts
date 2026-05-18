import { errorJson, stores } from "@/app/api/_helpers";
import { ANALYSIS_TEMPLATES } from "@/lib/analysis";
import { runContentAgent } from "@/lib/content-agent";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { articleStore, contentAgentStore, settingsStore } = stores();
    const article = await articleStore.getArticle(id);
    if (!article) {
      return Response.json({ error: "文章不存在" }, { status: 404 });
    }
    const agentRun = await runContentAgent(
      article,
      ANALYSIS_TEMPLATES,
      await settingsStore.getAiSettings(),
      contentAgentStore,
    );
    return Response.json({ agentRun }, { status: agentRun.status === "completed" ? 200 : 422 });
  } catch (error) {
    return errorJson(error);
  }
}
