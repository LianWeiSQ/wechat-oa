import { errorJson, stores } from "@/app/api/_helpers";

export const runtime = "nodejs";

export async function GET() {
  const { settingsStore } = stores();
  return Response.json({ settings: await settingsStore.getPublicImageSettings() });
}

export async function PUT(request: Request) {
  try {
    const { settingsStore } = stores();
    await settingsStore.saveImageSettings(await request.json());
    return Response.json({ settings: await settingsStore.getPublicImageSettings() });
  } catch (error) {
    return errorJson(error);
  }
}
