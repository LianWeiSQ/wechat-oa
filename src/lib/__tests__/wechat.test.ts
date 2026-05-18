import { describe, expect, it } from "vitest";
import { checkWeChatConnection, pushDraftToWeChat } from "@/lib/wechat";
import type { LocalDraft, WeChatConfig } from "@/lib/types";

const draft: LocalDraft = {
  id: "draft_1",
  title: "Agent 工程化避坑",
  body: "<p>正文</p>",
  sourceAnalysisIds: ["run_1"],
  exportFormat: "html",
  wechatDraftStatus: "not_sent",
  createdAt: "2026-05-14T00:00:00.000Z",
  updatedAt: "2026-05-14T00:00:00.000Z",
};

describe("WeChat integration", () => {
  it("reports missing credentials without making a network request", async () => {
    const result = await checkWeChatConnection({ appId: "", appSecret: "" }, async () => {
      throw new Error("should not call");
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("AppID");
  });

  it("checks credentials by requesting an access token", async () => {
    const calls: string[] = [];
    const result = await checkWeChatConnection(
      { appId: "wx123", appSecret: "secret" },
      async (url, init) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        return {
          ok: true,
          json: async () => ({ access_token: "token", expires_in: 7200 }),
        };
      },
    );

    expect(result.ok).toBe(true);
    expect(result.message).toContain("连接成功");
    expect(calls[0]).toContain("/cgi-bin/stable_token");
  });

  it("pushes an HTML local draft to the WeChat draft box when credentials are valid", async () => {
    const config: WeChatConfig = {
      appId: "wx123",
      appSecret: "secret",
      tokenStatus: "unchecked",
      lastCheckResult: "",
      updatedAt: "2026-05-14T00:00:00.000Z",
    };
    const urls: string[] = [];

    const result = await pushDraftToWeChat(draft, config, async (url) => {
      urls.push(url);
      if (url.includes("stable_token")) {
        return { ok: true, json: async () => ({ access_token: "token", expires_in: 7200 }) };
      }
      return { ok: true, json: async () => ({ errcode: 0, media_id: "media_123" }) };
    });

    expect(result.ok).toBe(true);
    expect(result.mediaId).toBe("media_123");
    expect(urls.some((url) => url.includes("/cgi-bin/draft/add"))).toBe(true);
  });
});
