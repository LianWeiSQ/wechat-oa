import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db";
import { createSettingsStore } from "@/lib/settings";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "wechat-oa-settings-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("settings defaults", () => {
  it("points AI settings to the CRS Responses backend by default", () => {
    const db = openDatabase(join(tempDir, "test.sqlite"));
    const settings = createSettingsStore(db).getAiSettings();
    db.close();

    expect(settings).toEqual({
      modelProvider: "crs",
      baseUrl: "https://vip.auto-code.net",
      apiKey: "",
      model: "gpt-5.4",
      reviewModel: "gpt-5.4",
      reviewModelProvider: "crs",
      reviewBaseUrl: "https://vip.auto-code.net",
      reviewApiKey: "",
      reviewWireApi: "responses",
      reviewReasoningEffort: "xhigh",
      wireApi: "responses",
      reasoningEffort: "xhigh",
      disableResponseStorage: true,
    });
  });
});
