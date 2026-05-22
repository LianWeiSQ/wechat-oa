import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "@/components/settings-page";

const aiSettings = {
  modelProvider: "crs",
  baseUrl: "https://vip.auto-code.net",
  apiKey: "sk-test",
  model: "gpt-5.4",
  reviewModel: "gpt-5.4",
  reviewBaseUrl: "https://review.example.com/v1",
  wireApi: "responses" as const,
  reasoningEffort: "xhigh" as const,
  disableResponseStorage: true,
};

const imageSettings = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-image-2",
  size: "1536x1024" as const,
  hasApiKey: false,
};

const wechatConfig = {
  appId: "",
  hasAppSecret: false,
  defaultThumbMediaId: "",
  tokenStatus: "unchecked" as const,
  lastCheckResult: "",
  updatedAt: "",
};

describe("SettingsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("collects model, image, and WeChat settings on a standalone page", () => {
    render(
      <SettingsPage
        initialAiSettings={aiSettings}
        initialImageSettings={imageSettings}
        initialWeChatConfig={wechatConfig}
      />,
    );

    expect(screen.getByRole("heading", { name: "模型配置" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "图片模型配置" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "微信后台" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回工作台" })).toHaveAttribute("href", "/");
    expect(screen.getByDisplayValue("https://vip.auto-code.net")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://review.example.com/v1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("gpt-image-2")).toBeInTheDocument();
  });

  it("saves model settings through the existing API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        settings: {
          ...aiSettings,
          model: "gpt-5.5",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SettingsPage
        initialAiSettings={aiSettings}
        initialImageSettings={imageSettings}
        initialWeChatConfig={wechatConfig}
      />,
    );

    const modelInput = screen.getByPlaceholderText("模型名");
    await userEvent.clear(modelInput);
    await userEvent.type(modelInput, "gpt-5.5");
    await userEvent.click(screen.getByRole("button", { name: "保存模型" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/ai",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining("gpt-5.5"),
      }),
    );
    expect(await screen.findByText("模型配置已保存")).toBeInTheDocument();
  });
});
