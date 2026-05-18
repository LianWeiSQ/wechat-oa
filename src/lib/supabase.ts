import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serviceClient: SupabaseClient | null = null;

export type SupabaseRuntimeConfig = {
  url: string;
  serviceRoleKey: string;
  storageBucket: string;
  defaultWorkspaceId: string;
};

export function getSupabaseConfig(): SupabaseRuntimeConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url,
    serviceRoleKey,
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET?.trim() || "wechat-oa-assets",
    defaultWorkspaceId: process.env.WECHAT_OA_WORKSPACE_ID?.trim() || "default",
  };
}

export function shouldUseSupabase(): boolean {
  return Boolean(getSupabaseConfig());
}

export function requireSupabaseConfig(): SupabaseRuntimeConfig {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("请先配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY，才能使用 Supabase 后端。");
  }
  return config;
}

export function getSupabaseServiceClient(): SupabaseClient {
  const config = requireSupabaseConfig();
  if (!serviceClient) {
    serviceClient = createClient(config.url, config.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return serviceClient;
}
