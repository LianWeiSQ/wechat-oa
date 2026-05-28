import { errorJson, stores } from "@/app/api/_helpers";
import type { AgentStrategyModule } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { agentStore } = stores();
    const strategies = await agentStore.ensureDefaultStrategies();
    return Response.json({ strategies });
  } catch (error) {
    return errorJson(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { agentStore } = stores();
    const strategy = await agentStore.createStrategy({
      name: stringValue(payload.name) || "未命名策略",
      description: stringValue(payload.description),
      targetChannel: payload.targetChannel === "xiaohongshu" ? "xiaohongshu" : "wechat",
      defaultModel: stringValue(payload.defaultModel),
      status: payload.status === "archived" ? "archived" : "active",
      modules: moduleArray(payload.modules),
    });
    return Response.json({ strategy }, { status: 201 });
  } catch (error) {
    return errorJson(error);
  }
}

function moduleArray(value: unknown): AgentStrategyModule[] {
  return Array.isArray(value) ? (value as AgentStrategyModule[]) : [];
}

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}
