import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db";
import { createDraftImageStore } from "@/lib/draft-images";
import { createDraftStore } from "@/lib/drafts";
import { createSettingsStore } from "@/lib/settings";

describe("image settings and draft image assets", () => {
  it("returns default image settings with a masked API key", () => {
    const db = openDatabase(":memory:");
    const settingsStore = createSettingsStore(db);

    const settings = settingsStore.getImageSettings();

    expect(settings.baseUrl).toBe("https://api.openai.com/v1");
    expect(settings.model).toBe("gpt-image-2");
    expect(settings.size).toBe("1536x1024");
    expect(settingsStore.getPublicImageSettings()).toMatchObject({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-image-2",
      size: "1536x1024",
      hasApiKey: false,
    });
  });

  it("saves image settings without exposing the API key publicly", () => {
    const db = openDatabase(":memory:");
    const settingsStore = createSettingsStore(db);

    settingsStore.saveImageSettings({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-local",
      model: "gpt-image-2",
      size: "1024x1024",
    });

    expect(settingsStore.getImageSettings().apiKey).toBe("sk-local");
    expect(settingsStore.getPublicImageSettings()).toMatchObject({
      hasApiKey: true,
      model: "gpt-image-2",
      size: "1024x1024",
    });
  });

  it("persists generated and failed image asset records", () => {
    const db = openDatabase(":memory:");
    const draftStore = createDraftStore(db);
    const imageStore = createDraftImageStore(db);
    const draft = draftStore.createDraft({
      title: "AI Agent 工程化",
      body: "<h1>AI Agent 工程化</h1>",
      sourceAnalysisIds: ["run_1"],
      exportFormat: "html",
    });

    const asset = imageStore.createAsset({
      draftId: draft.id,
      role: "hero",
      status: "generated",
      localPath: "/tmp/hero.png",
      publicPath: "/api/assets/images/hero.png",
      prompt: "technical magazine cover",
      revisedPrompt: "",
      alt: "AI Agent 工程化封面",
      caption: "AI Agent 工程化不是聊天能力，而是控制系统。",
      model: "gpt-image-2",
      size: "1536x1024",
      error: "",
    });

    expect(imageStore.listAssets(draft.id)).toEqual([asset]);
  });

  it("updates draft body without changing its identity", () => {
    const db = openDatabase(":memory:");
    const draftStore = createDraftStore(db);
    const draft = draftStore.createDraft({
      title: "AI Agent 工程化",
      body: "<h1>Old</h1>",
      sourceAnalysisIds: ["run_1"],
      exportFormat: "html",
    });

    const updated = draftStore.updateDraftBody(draft.id, "<h1>New</h1>");

    expect(updated?.id).toBe(draft.id);
    expect(updated?.body).toBe("<h1>New</h1>");
    expect(draftStore.getDraft(draft.id)?.body).toBe("<h1>New</h1>");
  });
});
