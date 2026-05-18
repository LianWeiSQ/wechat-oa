import { stores, errorJson } from "@/app/api/_helpers";

export const runtime = "nodejs";

export async function GET() {
  const { settingsStore } = stores();
  return Response.json({ settings: await settingsStore.getAiSettings() });
}

export async function PUT(request: Request) {
  try {
    const { settingsStore } = stores();
    const settings = await settingsStore.saveAiSettings(await request.json());
    return Response.json({ settings });
  } catch (error) {
    return errorJson(error);
  }
}
