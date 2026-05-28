import { errorJson, stores } from "@/app/api/_helpers";
import type { AgentDraftStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { agentStore } = stores();
    const agentDraft = await agentStore.getDraft(id);
    if (!agentDraft) {
      return Response.json({ error: "Agent 草稿不存在" }, { status: 404 });
    }
    return Response.json({ agentDraft });
  } catch (error) {
    return errorJson(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { agentStore } = stores();
    const agentDraft = await agentStore.updateDraft(id, {
      title: optionalString(payload.title),
      bodyHtml: optionalString(payload.bodyHtml),
      topic: optionalString(payload.topic),
      status: optionalStatus(payload.status),
      error: optionalString(payload.error),
    });
    if (!agentDraft) {
      return Response.json({ error: "Agent 草稿不存在" }, { status: 404 });
    }
    return Response.json({ agentDraft });
  } catch (error) {
    return errorJson(error);
  }
}

function optionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : String(value ?? "").trim();
}

function optionalStatus(value: unknown): AgentDraftStatus | undefined {
  if (value === undefined) {
    return undefined;
  }
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
  return "generated";
}
