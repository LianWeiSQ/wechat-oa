import { stores } from "@/app/api/_helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const { articleStore } = stores();
  return Response.json({ articles: await articleStore.listArticles(query) });
}
