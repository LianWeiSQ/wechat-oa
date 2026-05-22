import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { nowIso } from "@/lib/ids";
import type {
  AiReasoningEffort,
  AiSettings,
  AiWireApi,
  ImageSettings,
  ImageSize,
  PublicImageSettings,
  PublicWeChatConfig,
  WeChatConfig,
} from "@/lib/types";

const AI_KEY = "ai";
const WECHAT_KEY = "wechat";
const IMAGE_KEY = "image";
const DEFAULT_AI_MODEL_PROVIDER = "crs";
const DEFAULT_AI_BASE_URL = "https://vip.auto-code.net";
const DEFAULT_AI_API_KEY = "";
const DEFAULT_AI_MODEL = "gpt-5.4";
const DEFAULT_AI_REVIEW_MODEL = "gpt-5.4";
const DEFAULT_AI_WIRE_API: AiWireApi = "responses";
const DEFAULT_AI_REASONING_EFFORT: AiReasoningEffort = "xhigh";
const DEFAULT_AI_DISABLE_RESPONSE_STORAGE = true;
const DEFAULT_IMAGE_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_IMAGE_SIZE: ImageSize = "1536x1024";

export function createSettingsStore(db: DatabaseSync) {
  return {
    getAiSettings(): AiSettings {
      const saved = getJson<Partial<AiSettings> & { apiKeyEncrypted?: string; reviewApiKeyEncrypted?: string }>(db, AI_KEY, {});
      const apiKey = saved.apiKeyEncrypted
        ? unsealSecret(saved.apiKeyEncrypted)
        : saved.apiKey ?? process.env.OPENAI_API_KEY ?? DEFAULT_AI_API_KEY;
      const baseUrl = saved.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULT_AI_BASE_URL;
      const modelProvider = saved.modelProvider ?? process.env.OPENAI_MODEL_PROVIDER ?? DEFAULT_AI_MODEL_PROVIDER;
      const wireApi = normalizeAiWireApi(saved.wireApi ?? process.env.OPENAI_WIRE_API);
      const reasoningEffort = normalizeAiReasoningEffort(saved.reasoningEffort ?? process.env.OPENAI_REASONING_EFFORT);
      return {
        modelProvider,
        baseUrl,
        apiKey,
        model: saved.model ?? process.env.OPENAI_MODEL ?? DEFAULT_AI_MODEL,
        reviewModel: saved.reviewModel ?? process.env.OPENAI_REVIEW_MODEL ?? DEFAULT_AI_REVIEW_MODEL,
        reviewModelProvider: saved.reviewModelProvider ?? process.env.OPENAI_REVIEW_MODEL_PROVIDER ?? modelProvider,
        reviewBaseUrl: saved.reviewBaseUrl ?? process.env.OPENAI_REVIEW_BASE_URL ?? baseUrl,
        reviewApiKey: saved.reviewApiKeyEncrypted
          ? unsealSecret(saved.reviewApiKeyEncrypted)
          : saved.reviewApiKey ?? process.env.OPENAI_REVIEW_API_KEY ?? apiKey,
        reviewWireApi: normalizeAiWireApi(saved.reviewWireApi ?? process.env.OPENAI_REVIEW_WIRE_API ?? wireApi),
        reviewReasoningEffort: normalizeAiReasoningEffort(
          saved.reviewReasoningEffort ?? process.env.OPENAI_REVIEW_REASONING_EFFORT ?? reasoningEffort,
        ),
        wireApi,
        reasoningEffort,
        disableResponseStorage: normalizeBoolean(
          saved.disableResponseStorage ?? process.env.OPENAI_DISABLE_RESPONSE_STORAGE,
          DEFAULT_AI_DISABLE_RESPONSE_STORAGE,
        ),
      };
    },

    saveAiSettings(input: Partial<AiSettings>): AiSettings {
      const normalized = normalizeAiSettings(input, this.getAiSettings());
      setJson(db, AI_KEY, {
        modelProvider: normalized.modelProvider,
        baseUrl: normalized.baseUrl,
        apiKeyEncrypted: normalized.apiKey ? sealSecret(normalized.apiKey) : "",
        model: normalized.model,
        reviewModel: normalized.reviewModel,
        reviewModelProvider: normalized.reviewModelProvider,
        reviewBaseUrl: normalized.reviewBaseUrl,
        reviewApiKeyEncrypted: normalized.reviewApiKey ? sealSecret(normalized.reviewApiKey) : "",
        reviewWireApi: normalized.reviewWireApi,
        reviewReasoningEffort: normalized.reviewReasoningEffort,
        wireApi: normalized.wireApi,
        reasoningEffort: normalized.reasoningEffort,
        disableResponseStorage: normalized.disableResponseStorage,
      });
      return normalized;
    },

    getImageSettings(): ImageSettings {
      const saved = getJson<{
        baseUrl?: string;
        apiKeyEncrypted?: string;
        model?: string;
        size?: string;
      }>(db, IMAGE_KEY, {});
      return {
        baseUrl: saved.baseUrl ?? process.env.OPENAI_IMAGE_BASE_URL ?? DEFAULT_IMAGE_BASE_URL,
        apiKey: saved.apiKeyEncrypted
          ? unsealSecret(saved.apiKeyEncrypted)
          : process.env.OPENAI_IMAGE_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
        model: saved.model ?? process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL,
        size: normalizeImageSize(saved.size ?? process.env.OPENAI_IMAGE_SIZE),
      };
    },

    getPublicImageSettings(): PublicImageSettings {
      return toPublicImageSettings(this.getImageSettings());
    },

    saveImageSettings(input: Partial<ImageSettings>): ImageSettings {
      const current = this.getImageSettings();
      const next: ImageSettings = {
        baseUrl: input.baseUrl?.trim() || current.baseUrl,
        apiKey: input.apiKey?.trim() || current.apiKey,
        model: input.model?.trim() || current.model,
        size: normalizeImageSize(input.size ?? current.size),
      };
      setJson(db, IMAGE_KEY, {
        baseUrl: next.baseUrl,
        apiKeyEncrypted: next.apiKey ? sealSecret(next.apiKey) : "",
        model: next.model,
        size: next.size,
      });
      return next;
    },

    getWeChatConfig(): WeChatConfig {
      const saved = getJson<{
        appId?: string;
        appSecretEncrypted?: string;
        defaultThumbMediaId?: string;
        tokenStatus?: WeChatConfig["tokenStatus"];
        lastCheckResult?: string;
        updatedAt?: string;
      }>(db, WECHAT_KEY, {});
      return {
        appId: saved.appId ?? process.env.WECHAT_APP_ID ?? "",
        appSecret: saved.appSecretEncrypted
          ? unsealSecret(saved.appSecretEncrypted)
          : process.env.WECHAT_APP_SECRET ?? "",
        defaultThumbMediaId: saved.defaultThumbMediaId ?? process.env.WECHAT_THUMB_MEDIA_ID ?? "",
        tokenStatus: saved.tokenStatus ?? "unchecked",
        lastCheckResult: saved.lastCheckResult ?? "",
        updatedAt: saved.updatedAt ?? "",
      };
    },

    getPublicWeChatConfig(): PublicWeChatConfig {
      return toPublicWeChatConfig(this.getWeChatConfig());
    },

    saveWeChatConfig(input: Partial<WeChatConfig>): WeChatConfig {
      const current = this.getWeChatConfig();
      const next: WeChatConfig = {
        appId: input.appId?.trim() ?? current.appId,
        appSecret: input.appSecret?.trim() ?? current.appSecret,
        defaultThumbMediaId: input.defaultThumbMediaId?.trim() ?? current.defaultThumbMediaId,
        tokenStatus: input.tokenStatus ?? current.tokenStatus,
        lastCheckResult: input.lastCheckResult ?? current.lastCheckResult,
        updatedAt: nowIso(),
      };
      setJson(db, WECHAT_KEY, {
        appId: next.appId,
        appSecretEncrypted: next.appSecret ? sealSecret(next.appSecret) : "",
        defaultThumbMediaId: next.defaultThumbMediaId ?? "",
        tokenStatus: next.tokenStatus,
        lastCheckResult: next.lastCheckResult,
        updatedAt: next.updatedAt,
      });
      return next;
    },
  };
}

export function toPublicImageSettings(settings: ImageSettings): PublicImageSettings {
  return {
    baseUrl: settings.baseUrl,
    model: settings.model,
    size: settings.size,
    hasApiKey: Boolean(settings.apiKey),
  };
}

export function normalizeAiSettings(input: Partial<AiSettings>, current?: AiSettings): AiSettings {
  const modelProvider = input.modelProvider?.trim() || current?.modelProvider || DEFAULT_AI_MODEL_PROVIDER;
  const baseUrl = input.baseUrl?.trim() || current?.baseUrl || DEFAULT_AI_BASE_URL;
  const apiKey = input.apiKey?.trim() || current?.apiKey || process.env.OPENAI_API_KEY || DEFAULT_AI_API_KEY;
  const model = input.model?.trim() || current?.model || DEFAULT_AI_MODEL;
  const wireApi = normalizeAiWireApi(input.wireApi ?? current?.wireApi);
  const reasoningEffort = normalizeAiReasoningEffort(input.reasoningEffort ?? current?.reasoningEffort);
  return {
    modelProvider,
    baseUrl,
    apiKey,
    model,
    reviewModel: input.reviewModel?.trim() || current?.reviewModel || model || DEFAULT_AI_REVIEW_MODEL,
    reviewModelProvider: input.reviewModelProvider?.trim() || current?.reviewModelProvider || modelProvider,
    reviewBaseUrl: input.reviewBaseUrl?.trim() || current?.reviewBaseUrl || baseUrl,
    reviewApiKey: input.reviewApiKey?.trim() || current?.reviewApiKey || apiKey,
    reviewWireApi: normalizeAiWireApi(input.reviewWireApi ?? current?.reviewWireApi ?? wireApi),
    reviewReasoningEffort: normalizeAiReasoningEffort(
      input.reviewReasoningEffort ?? current?.reviewReasoningEffort ?? reasoningEffort,
    ),
    wireApi,
    reasoningEffort,
    disableResponseStorage: normalizeBoolean(
      input.disableResponseStorage ?? current?.disableResponseStorage,
      DEFAULT_AI_DISABLE_RESPONSE_STORAGE,
    ),
  };
}

export function normalizeAiWireApi(value?: string): AiWireApi {
  return value === "chat-completions" ? "chat-completions" : DEFAULT_AI_WIRE_API;
}

export function normalizeAiReasoningEffort(value?: string): AiReasoningEffort {
  if (value === "none" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh") {
    return value;
  }
  return DEFAULT_AI_REASONING_EFFORT;
}

export function toPublicWeChatConfig(config: WeChatConfig): PublicWeChatConfig {
  return {
    appId: config.appId,
    defaultThumbMediaId: config.defaultThumbMediaId,
    tokenStatus: config.tokenStatus,
    lastCheckResult: config.lastCheckResult,
    updatedAt: config.updatedAt,
    hasAppSecret: Boolean(config.appSecret),
  };
}

function getJson<T>(db: DatabaseSync, key: string, fallback: T): T {
  const row = db.prepare("SELECT value_json FROM settings WHERE key = ?").get(key) as
    | { value_json: string }
    | undefined;
  if (!row) {
    return fallback;
  }
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

export function normalizeImageSize(value?: string): ImageSize {
  if (value === "1024x1024" || value === "1024x1536" || value === "1536x1024" || value === "auto") {
    return value;
  }
  return DEFAULT_IMAGE_SIZE;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
      return false;
    }
  }
  return fallback;
}

function setJson(db: DatabaseSync, key: string, value: unknown): void {
  db.prepare(`
    INSERT INTO settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), nowIso());
}

function secretKey(): Buffer {
  return createHash("sha256")
    .update(process.env.WECHAT_OA_SECRET_KEY ?? "wechat-oa-local-development-key")
    .digest();
}

export function sealSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function unsealSecret(value: string): string {
  try {
    const payload = Buffer.from(value, "base64");
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", secretKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
