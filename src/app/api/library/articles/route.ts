import { stores } from "@/app/api/_helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const { articleStore } = stores();
  return Response.json({ articles: await articleStore.listArticles(query) });
}
