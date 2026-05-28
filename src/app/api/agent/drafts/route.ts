import { errorJson, stores } from "@/app/api/_helpers";
import type { AgentDraftStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { agentStore } = stores();
    const drafts = await agentStore.listDrafts({ status: normalizeStatus(url.searchParams.get("status")) });
    return Response.json({ drafts });
  } catch (error) {
    return errorJson(error);
  }
}

function normalizeStatus(value: string | null): AgentDraftStatus | "all" {
  if (
    value === "generated" ||
    value === "editing" ||
    value === "approved" ||
    value === "pushed_local" ||
    value === "pushed_wechat" ||
    value === "failed" ||
    value === "archived"
  ) {
    return value;
  }
  return "all";
}
