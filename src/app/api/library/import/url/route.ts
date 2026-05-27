import { errorJson, stores } from "@/app/api/_helpers";
import { importUrlArticle } from "@/lib/importers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { url, sourceProject } = (await request.json()) as { url?: string; sourceProject?: string };
    const { articleStore } = stores();
    const result = await importUrlArticle(articleStore, url ?? "", fetch, { sourceProject });
    return Response.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    return errorJson(error);
  }
}
