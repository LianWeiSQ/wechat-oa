import type { LocalDraft, WeChatConfig } from "@/lib/types";
import { stripHtml } from "@/lib/analysis";

type JsonResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

type WeChatFetch = (url: string, init?: RequestInit) => Promise<JsonResponse>;

export type WeChatCheckResult = {
  ok: boolean;
  message: string;
  accessToken?: string;
  expiresIn?: number;
};

export type WeChatDraftResult = {
  ok: boolean;
  message: string;
  mediaId?: string;
};

export async function checkWeChatConnection(
  config: Pick<WeChatConfig, "appId" | "appSecret">,
  fetcher: WeChatFetch = fetch,
): Promise<WeChatCheckResult> {
  if (!config.appId.trim() || !config.appSecret.trim()) {
    return { ok: false, message: "请先配置 AppID 和 AppSecret" };
  }

  const token = await requestStableToken(config.appId, config.appSecret, fetcher);
  if (!token.ok) {
    return token;
  }
  return {
    ok: true,
    message: `连接成功，token 有效期 ${token.expiresIn ?? 7200} 秒`,
    accessToken: token.accessToken,
    expiresIn: token.expiresIn,
  };
}

export async function pushDraftToWeChat(
  draft: LocalDraft,
  config: WeChatConfig,
  fetcher: WeChatFetch = fetch,
): Promise<WeChatDraftResult> {
  const token = await checkWeChatConnection(config, fetcher);
  if (!token.ok || !token.accessToken) {
    return { ok: false, message: token.message };
  }

  const digest = stripHtml(draft.body).slice(0, 120);
  const response = await fetcher(
    `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${encodeURIComponent(token.accessToken)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        articles: [
          {
            title: draft.title,
            author: "",
            digest,
            content: draft.body,
            content_source_url: "",
            thumb_media_id: config.defaultThumbMediaId ?? "",
            need_open_comment: 0,
            only_fans_can_comment: 0,
          },
        ],
      }),
    },
  );
  const data = (await response.json()) as { errcode?: number; errmsg?: string; media_id?: string };
  if (!response.ok || (data.errcode && data.errcode !== 0) || !data.media_id) {
    return {
      ok: false,
      message: `草稿投递失败：${data.errmsg ?? data.errcode ?? "未知错误"}`,
    };
  }
  return { ok: true, message: "已投递到微信公众号草稿箱", mediaId: data.media_id };
}

async function requestStableToken(
  appId: string,
  appSecret: string,
  fetcher: WeChatFetch,
): Promise<WeChatCheckResult> {
  const response = await fetcher("https://api.weixin.qq.com/cgi-bin/stable_token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credential",
      appid: appId,
      secret: appSecret,
      force_refresh: false,
    }),
  });
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    errcode?: number;
    errmsg?: string;
  };
  if (!response.ok || !data.access_token) {
    return {
      ok: false,
      message: `连接失败：${data.errmsg ?? data.errcode ?? "无法获取 access_token"}`,
    };
  }
  return {
    ok: true,
    message: "连接成功",
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}
