import { errorJson, stores } from "@/app/api/_helpers";
import type { AgentStrategyModule } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { agentStore } = stores();
    const strategy = await agentStore.getStrategy(id);
    if (!strategy) {
      return Response.json({ error: "Agent 策略不存在" }, { status: 404 });
    }
    return Response.json({ strategy });
  } catch (error) {
    return errorJson(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { agentStore } = stores();
    const strategy = await agentStore.updateStrategy(id, {
      name: optionalString(payload.name),
      description: optionalString(payload.description),
      targetChannel: optionalChannel(payload.targetChannel),
      defaultModel: optionalString(payload.defaultModel),
      status: optionalStatus(payload.status),
      modules: optionalModules(payload.modules),
    });
    if (!strategy) {
      return Response.json({ error: "Agent 策略不存在" }, { status: 404 });
    }
    return Response.json({ strategy });
  } catch (error) {
    return errorJson(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { agentStore } = stores();
    const deleted = await agentStore.deleteStrategy(id);
    if (!deleted) {
      return Response.json({ error: "Agent 策略不存在" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return errorJson(error);
  }
}

function optionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : String(value ?? "").trim();
}

function optionalChannel(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  return value === "xiaohongshu" ? "xiaohongshu" : "wechat";
}

function optionalStatus(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  return value === "archived" ? "archived" : "active";
}

function optionalModules(value: unknown): AgentStrategyModule[] | undefined {
  return value === undefined ? undefined : Array.isArray(value) ? (value as AgentStrategyModule[]) : [];
}
