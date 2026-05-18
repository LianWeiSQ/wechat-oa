import { stores } from "@/app/api/_helpers";
import { exportDraft } from "@/lib/drafts";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { format } = (await request.json().catch(() => ({}))) as { format?: "markdown" | "html" };
  const { draftStore } = stores();
  const draft = await draftStore.getDraft(id);
  if (!draft) {
    return Response.json({ error: "草稿不存在" }, { status: 404 });
  }
  const exportFormat = format ?? draft.exportFormat;
  return Response.json({
    draftId: draft.id,
    format: exportFormat,
    content: exportDraft(draft, exportFormat),
  });
}
