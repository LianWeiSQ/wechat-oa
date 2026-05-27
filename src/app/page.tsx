import { cookies } from "next/headers";
import { Workbench } from "@/components/workbench";
import { stores } from "@/app/api/_helpers";
import { ANALYSIS_TEMPLATES } from "@/lib/analysis";
import { DEFAULT_THEME_MODE, THEME_COOKIE_NAME, normalizeThemeMode } from "@/lib/theme";

export default async function Home() {
  const { articleStore, draftStore } = stores();
  const [articles, drafts, cookieStore] = await Promise.all([
    articleStore.listArticles(),
    draftStore.listDrafts(),
    cookies(),
  ]);
  const initialThemeMode = normalizeThemeMode(cookieStore.get(THEME_COOKIE_NAME)?.value) ?? DEFAULT_THEME_MODE;

  return (
    <Workbench
      initialArticles={articles}
      initialDrafts={drafts}
      templates={ANALYSIS_TEMPLATES}
      initialThemeMode={initialThemeMode}
    />
  );
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
