"use client";

import Link from "next/link";
import { CheckCircle2, Image as ImageIcon, Save, Send, Settings } from "lucide-react";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type {
  AiReasoningEffort,
  AiSettings,
  AiWireApi,
  ImageSize,
  PublicImageSettings,
  PublicWeChatConfig,
  WeChatConfig,
} from "@/lib/types";

type ClientWeChatConfig = PublicWeChatConfig | WeChatConfig;

type SettingsPageProps = {
  initialAiSettings: AiSettings;
  initialImageSettings: PublicImageSettings;
  initialWeChatConfig: ClientWeChatConfig;
};

type Notice = {
  type: "ok" | "error" | "info";
  text: string;
};

const inputClassName = "field settings-field";

export function SettingsPage({ initialAiSettings, initialImageSettings, initialWeChatConfig }: SettingsPageProps) {
  const [aiSettings, setAiSettings] = useState(initialAiSettings);
  const [imageSettings, setImageSettings] = useState(initialImageSettings);
  const [wechatConfig, setWeChatConfig] = useState(initialWeChatConfig);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function handleSaveAiSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("ai-settings");
    const form = new FormData(event.currentTarget);
    const payload = {
      modelProvider: String(form.get("modelProvider") ?? ""),
      baseUrl: String(form.get("baseUrl") ?? ""),
      apiKey: String(form.get("apiKey") ?? ""),
      model: String(form.get("model") ?? ""),
      reviewModel: String(form.get("reviewModel") ?? ""),
      reviewModelProvider: String(form.get("reviewModelProvider") ?? ""),
      reviewBaseUrl: String(form.get("reviewBaseUrl") ?? ""),
      reviewApiKey: String(form.get("reviewApiKey") ?? ""),
      reviewWireApi: String(form.get("reviewWireApi") ?? "") as AiWireApi,
      reviewReasoningEffort: String(form.get("reviewReasoningEffort") ?? "") as AiReasoningEffort,
      wireApi: String(form.get("wireApi") ?? "") as AiWireApi,
      reasoningEffort: String(form.get("reasoningEffort") ?? "") as AiReasoningEffort,
      disableResponseStorage: form.get("disableResponseStorage") === "on",
    };
    const response = await fetch("/api/settings/ai", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    setBusy(null);
    if (!response.ok) {
      setNotice({ type: "error", text: data.error ?? "模型配置保存失败" });
      return;
    }
    setAiSettings(data.settings);
    setNotice({ type: "ok", text: "模型配置已保存" });
  }

  async function handleSaveImageSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("image-settings");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/settings/image", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        baseUrl: String(form.get("imageBaseUrl") ?? ""),
        apiKey: String(form.get("imageApiKey") ?? ""),
        model: String(form.get("imageModel") ?? ""),
        size: String(form.get("imageSize") ?? "") as ImageSize,
      }),
    });
    const data = await response.json();
    setBusy(null);
    if (!response.ok) {
      setNotice({ type: "error", text: data.error ?? "图片模型配置保存失败" });
      return;
    }
    setImageSettings(data.settings);
    setNotice({ type: "ok", text: "图片模型配置已保存" });
  }

  async function handleSaveWeChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("wechat-settings");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/settings/wechat", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        appId: String(form.get("appId") ?? ""),
        appSecret: String(form.get("appSecret") ?? ""),
        defaultThumbMediaId: String(form.get("defaultThumbMediaId") ?? ""),
      }),
    });
    const data = await response.json();
    setBusy(null);
    if (!response.ok) {
      setNotice({ type: "error", text: data.error ?? "微信配置保存失败" });
      return;
    }
    setWeChatConfig(data.config);
    setNotice({ type: "ok", text: "微信配置已保存" });
  }

  async function handleWeChatCheck() {
    setBusy("wechat-check");
    const response = await fetch("/api/wechat/check", { method: "POST" });
    const data = await response.json();
    setBusy(null);
    setWeChatConfig(data.config ?? wechatConfig);
    setNotice({ type: data.ok ? "ok" : "error", text: data.message ?? "微信连接检测失败" });
  }

  return (
    <main className="settings-shell" data-theme="light">
      <header className="settings-topbar">
        <Link href="/" className="settings-back-link">
          wechat-oa
        </Link>
        <div className="settings-topbar-actions">
          {notice ? <SettingsNotice notice={notice} /> : null}
          <Link href="/" className="settings-icon-button" aria-label="返回工作台">
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <section className="settings-page-stack" aria-label="配置中心">
        <SettingsCard icon={<Settings className="h-5 w-5" />} title="模型配置">
          <form className="settings-form" onSubmit={handleSaveAiSettings}>
            <input name="modelProvider" defaultValue={aiSettings.modelProvider ?? "OpenAI"} placeholder="Provider，例如 OpenAI" className={inputClassName} />
            <input name="baseUrl" defaultValue={aiSettings.baseUrl} placeholder="Base URL" className={inputClassName} />
            <input name="model" defaultValue={aiSettings.model} placeholder="模型名" className={inputClassName} />
            <div className="settings-two-col">
              <select name="wireApi" defaultValue={aiSettings.wireApi ?? "responses"} className={inputClassName}>
                <option value="responses">Responses API</option>
                <option value="chat-completions">Chat Completions</option>
              </select>
              <select name="reasoningEffort" defaultValue={aiSettings.reasoningEffort ?? "xhigh"} className={inputClassName}>
                <option value="none">none</option>
                <option value="minimal">minimal</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="xhigh">xhigh</option>
              </select>
            </div>
            <input name="apiKey" type="password" defaultValue={aiSettings.apiKey} placeholder="API Key" className={inputClassName} />
            <div className="settings-card-title">
              <h2>技术/审稿模型</h2>
            </div>
            <input
              name="reviewModelProvider"
              defaultValue={aiSettings.reviewModelProvider ?? aiSettings.modelProvider ?? "OpenAI"}
              placeholder="审稿 Provider"
              className={inputClassName}
            />
            <input
              name="reviewBaseUrl"
              defaultValue={aiSettings.reviewBaseUrl ?? aiSettings.baseUrl}
              placeholder="审稿 Base URL"
              className={inputClassName}
            />
            <input name="reviewModel" defaultValue={aiSettings.reviewModel ?? aiSettings.model} placeholder="审稿模型名" className={inputClassName} />
            <div className="settings-two-col">
              <select name="reviewWireApi" defaultValue={aiSettings.reviewWireApi ?? aiSettings.wireApi ?? "responses"} className={inputClassName}>
                <option value="responses">Responses API</option>
                <option value="chat-completions">Chat Completions</option>
              </select>
              <select
                name="reviewReasoningEffort"
                defaultValue={aiSettings.reviewReasoningEffort ?? aiSettings.reasoningEffort ?? "xhigh"}
                className={inputClassName}
              >
                <option value="none">none</option>
                <option value="minimal">minimal</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="xhigh">xhigh</option>
              </select>
            </div>
            <input
              name="reviewApiKey"
              type="password"
              defaultValue={aiSettings.reviewApiKey ?? aiSettings.apiKey}
              placeholder="审稿 API Key"
              className={inputClassName}
            />
            <label className="settings-checkbox-line">
              <input name="disableResponseStorage" type="checkbox" defaultChecked={aiSettings.disableResponseStorage ?? true} />
              <span>禁用 Responses 存储</span>
            </label>
            <button type="submit" className="settings-submit-button" disabled={busy === "ai-settings"}>
              <Save className="h-5 w-5" />
              保存模型
            </button>
          </form>
        </SettingsCard>

        <SettingsCard icon={<ImageIcon className="h-5 w-5" />} title="图片模型配置">
          <form className="settings-form" onSubmit={handleSaveImageSettings}>
            <input name="imageBaseUrl" defaultValue={imageSettings.baseUrl} placeholder="图片 Base URL" className={inputClassName} />
            <input name="imageModel" defaultValue={imageSettings.model} placeholder="图片模型" className={inputClassName} />
            <select name="imageSize" defaultValue={imageSettings.size} className={inputClassName}>
              <option value="1536x1024">1536x1024</option>
              <option value="1024x1024">1024x1024</option>
              <option value="1024x1536">1024x1536</option>
              <option value="auto">auto</option>
            </select>
            <input
              name="imageApiKey"
              type="password"
              placeholder={imageSettings.hasApiKey ? "已保存图片 API Key" : "图片 API Key"}
              className={inputClassName}
            />
            <button type="submit" className="settings-submit-button" disabled={busy === "image-settings"}>
              <Save className="h-5 w-5" />
              保存图片模型
            </button>
          </form>
        </SettingsCard>

        <SettingsCard icon={<Send className="h-5 w-5" />} title="微信后台">
          <form className="settings-form" onSubmit={handleSaveWeChat}>
            <input name="appId" defaultValue={wechatConfig.appId} placeholder="AppID" className={inputClassName} />
            <input
              name="appSecret"
              type="password"
              placeholder={hasWeChatSecret(wechatConfig) ? "已保存 AppSecret" : "AppSecret"}
              className={inputClassName}
            />
            <input
              name="defaultThumbMediaId"
              defaultValue={wechatConfig.defaultThumbMediaId ?? ""}
              placeholder="封面素材 media_id"
              className={inputClassName}
            />
            <div className="settings-two-col">
              <button type="submit" className="settings-submit-button" disabled={busy === "wechat-settings"}>
                <Save className="h-5 w-5" />
                保存
              </button>
              <button type="button" className="settings-submit-button" onClick={handleWeChatCheck} disabled={busy === "wechat-check"}>
                <CheckCircle2 className="h-5 w-5" />
                检测
              </button>
            </div>
          </form>
        </SettingsCard>
      </section>
    </main>
  );
}

function SettingsCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="settings-card">
      <div className="settings-card-title">
        <span className="settings-card-icon">{icon}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SettingsNotice({ notice }: { notice: Notice }) {
  return <div className={`settings-notice settings-notice-${notice.type}`}>{notice.text}</div>;
}

function hasWeChatSecret(config: ClientWeChatConfig): boolean {
  if ("hasAppSecret" in config) {
    return config.hasAppSecret;
  }
  return Boolean(config.appSecret);
}
