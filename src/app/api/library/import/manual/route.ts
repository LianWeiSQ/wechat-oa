import { errorJson, stores } from "@/app/api/_helpers";
import { importManualArticle } from "@/lib/importers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { articleStore } = stores();
    const article = await importManualArticle(articleStore, await request.json());
    return Response.json({ article });
  } catch (error) {
    return errorJson(error);
  }
}
