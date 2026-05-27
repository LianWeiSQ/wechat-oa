import { stores, errorJson } from "@/app/api/_helpers";

export const runtime = "nodejs";

export async function GET() {
  const { draftStore } = stores();
  return Response.json({ drafts: await draftStore.listDrafts() });
}

export async function POST(request: Request) {
  try {
    const {
      title,
      body,
      sourceAnalysisIds,
      sourceArticleIds,
      contentChannel,
      publishStatus,
      plannedPublishAt,
      publishedAt,
      queueOrder,
      notes,
      exportFormat,
    } = await request.json();
    const { draftStore } = stores();
    const draft = await draftStore.createDraft({
      title,
      body,
      sourceAnalysisIds: sourceAnalysisIds ?? [],
      sourceArticleIds: sourceArticleIds ?? [],
      contentChannel,
      publishStatus,
      plannedPublishAt,
      publishedAt,
      queueOrder,
      notes,
      exportFormat: exportFormat ?? "html",
    });
    return Response.json({ draft });
  } catch (error) {
    return errorJson(error);
  }
}
