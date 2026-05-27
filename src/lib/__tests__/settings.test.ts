import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db";
import { createSettingsStore } from "@/lib/settings";

let tempDir: string;
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  tempDir = mkdtempSync(join(tmpdir(), "wechat-oa-settings-"));
});

afterEach(() => {
  process.env = originalEnv;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("settings defaults", () => {
  it("points AI settings to the local OpenAI Responses gateway by default", () => {
    const db = openDatabase(join(tempDir, "test.sqlite"));
    const settings = createSettingsStore(db).getAiSettings();
    db.close();

    expect(settings).toEqual({
      modelProvider: "OpenAI",
      baseUrl: "http://127.0.0.1:3000",
      apiKey: "",
      model: "gpt-5.4",
      reviewModel: "gpt-5.4",
      reviewModelProvider: "OpenAI",
      reviewBaseUrl: "http://127.0.0.1:3000",
      reviewApiKey: "",
      reviewWireApi: "responses",
      reviewReasoningEffort: "xhigh",
      wireApi: "responses",
      reasoningEffort: "xhigh",
      disableResponseStorage: true,
      requiresOpenAiAuth: true,
      networkAccess: "enabled",
      windowsWslSetupAcknowledged: true,
      modelContextWindow: 1000000,
      modelAutoCompactTokenLimit: 900000,
    });
  });

  it("uses local env AI settings ahead of SQL settings", () => {
    process.env.OPENAI_MODEL_PROVIDER = "OpenAI";
    process.env.OPENAI_BASE_URL = "http://127.0.0.1:3000";
    process.env.OPENAI_API_KEY = "sk-local";
    process.env.OPENAI_MODEL = "gpt-5.4";
    process.env.OPENAI_REVIEW_MODEL = "gpt-5.4";

    const db = openDatabase(join(tempDir, "test.sqlite"));
    db.prepare(`
      INSERT INTO settings (key, value_json, updated_at)
      VALUES ('ai', '{"modelProvider":"MiniMax","baseUrl":"https://api.minimaxi.com/v1","apiKey":"sk-sql","model":"MiniMax-M2.7"}', 'now')
    `).run();

    const settings = createSettingsStore(db).getAiSettings();
    db.close();

    expect(settings.modelProvider).toBe("OpenAI");
    expect(settings.baseUrl).toBe("http://127.0.0.1:3000");
    expect(settings.apiKey).toBe("sk-local");
    expect(settings.model).toBe("gpt-5.4");
  });

  it("does not persist AI settings to SQL when local env is configured", () => {
    process.env.OPENAI_BASE_URL = "http://127.0.0.1:3000";

    const db = openDatabase(join(tempDir, "test.sqlite"));
    const store = createSettingsStore(db);
    const settings = store.saveAiSettings({
      baseUrl: "https://should-not-persist.example.com",
      apiKey: "sk-should-not-persist",
      model: "should-not-persist",
    });
    const row = db.prepare("SELECT value_json FROM settings WHERE key = 'ai'").get();
    db.close();

    expect(settings.baseUrl).toBe("http://127.0.0.1:3000");
    expect(row).toBeUndefined();
  });
});
