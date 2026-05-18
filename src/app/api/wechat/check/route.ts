import { stores, errorJson } from "@/app/api/_helpers";
import { toPublicWeChatConfig } from "@/lib/settings";
import { checkWeChatConnection } from "@/lib/wechat";

export const runtime = "nodejs";

export async function POST() {
  try {
    const { settingsStore } = stores();
    const current = await settingsStore.getWeChatConfig();
    const result = await checkWeChatConnection(current);
    const saved = await settingsStore.saveWeChatConfig({
      tokenStatus: result.ok ? "ok" : "error",
      lastCheckResult: result.message,
    });
    return Response.json({
      ok: result.ok,
      message: result.message,
      config: toPublicWeChatConfig(saved),
    }, { status: result.ok ? 200 : 422 });
  } catch (error) {
    return errorJson(error);
  }
}
