import { errorJson, stores } from "@/app/api/_helpers";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { articleStore, contentAgentStore } = stores();
  const article = await articleStore.getArticle(id);
  if (!article) {
    return Response.json({ error: "文章不存在" }, { status: 404 });
  }
  return Response.json({
    article,
    parseRuns: await articleStore.listParseRuns(id),
    agentRuns: await contentAgentStore.listAgentRuns(id),
    analysisRuns: await articleStore.listAnalysisRuns(id),
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { articleStore } = stores();
    const article = await articleStore.updateArticle(id, await request.json());
    if (!article) {
      return Response.json({ error: "文章不存在" }, { status: 404 });
    }
    return Response.json({ article });
  } catch (error) {
    return errorJson(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { articleStore } = stores();
    const deleted = await articleStore.deleteArticle(id);
    if (!deleted) {
      return Response.json({ error: "文章不存在" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return errorJson(error);
  }
}
