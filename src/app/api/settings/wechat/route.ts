import { stores, errorJson } from "@/app/api/_helpers";
import { toPublicWeChatConfig } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  const { settingsStore } = stores();
  return Response.json({ config: await settingsStore.getPublicWeChatConfig() });
}

export async function PUT(request: Request) {
  try {
    const { settingsStore } = stores();
    const config = await settingsStore.saveWeChatConfig(await request.json());
    return Response.json({ config: toPublicWeChatConfig(config) });
  } catch (error) {
    return errorJson(error);
  }
}
