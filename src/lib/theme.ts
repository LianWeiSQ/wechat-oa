export type ThemeMode = "dark" | "light";

export const DEFAULT_THEME_MODE: ThemeMode = "light";
export const THEME_COOKIE_NAME = "wechat-oa-theme";
export const THEME_STORAGE_KEY = "wechat-oa:theme:v1";

export function normalizeThemeMode(value: unknown): ThemeMode | null {
  return value === "dark" || value === "light" ? value : null;
}
