import { createArticleStore } from "@/lib/articles";
import { createContentAgentStore } from "@/lib/content-agent";
import { getAppDatabase } from "@/lib/db";
import { createDraftImageStore } from "@/lib/draft-images";
import { createDraftStore } from "@/lib/drafts";
import { createSettingsStore } from "@/lib/settings";
import { shouldUseSupabase } from "@/lib/supabase";
import { createSupabaseStores } from "@/lib/supabase-stores";
import { createWritingStore } from "@/lib/writing-store";

export function stores() {
  if (shouldUseSupabase()) {
    return createSupabaseStores();
  }

  const db = getAppDatabase();
  return {
    articleStore: createArticleStore(db),
    contentAgentStore: createContentAgentStore(db),
    draftStore: createDraftStore(db),
    draftImageStore: createDraftImageStore(db),
    settingsStore: createSettingsStore(db),
    writingStore: createWritingStore(db),
  };
}

export function errorJson(error: unknown, status = 400): Response {
  return Response.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status },
  );
}
