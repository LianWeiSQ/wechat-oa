import type { DatabaseSync } from "node:sqlite";
import { createId, nowIso } from "@/lib/ids";
import type { DraftImageAsset, ImageSize } from "@/lib/types";

type DraftImageAssetRow = {
  id: string;
  draft_id: string;
  asset_id?: string;
  role: DraftImageAsset["role"];
  status: DraftImageAsset["status"];
  local_path: string;
  public_path: string;
  prompt: string;
  revised_prompt: string;
  alt: string;
  caption: string;
  model: string;
  size: ImageSize;
  error: string;
  created_at: string;
  updated_at: string;
};

type DraftImageAssetInput = Omit<DraftImageAsset, "id" | "createdAt" | "updatedAt">;

export function createDraftImageStore(db: DatabaseSync) {
  return {
    createAsset(input: DraftImageAssetInput): DraftImageAsset {
      const timestamp = nowIso();
      const assetId = createId("asset");
      const asset: DraftImageAsset = {
        id: createId("img"),
        draftId: input.draftId,
        role: input.role,
        status: input.status,
        localPath: input.localPath,
        publicPath: input.publicPath,
        prompt: input.prompt,
        revisedPrompt: input.revisedPrompt,
        alt: input.alt,
        caption: input.caption,
        model: input.model,
        size: input.size,
        error: input.error,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      db.prepare(`
        INSERT INTO assets (
          id, workspace_id, kind, source_type, status, original_url, object_key,
          public_path, sha256, mime_type, byte_size, prompt, revised_prompt,
          alt, caption, model, error, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        assetId,
        "default",
        "image",
        "generated-draft",
        asset.status === "generated" ? "stored" : "failed",
        "",
        asset.localPath,
        asset.publicPath,
        "",
        asset.status === "generated" ? "image/png" : "",
        0,
        asset.prompt,
        asset.revisedPrompt,
        asset.alt,
        asset.caption,
        asset.model,
        asset.error,
        asset.createdAt,
        asset.updatedAt,
      );

      db.prepare(`
        INSERT INTO asset_links (
          id, workspace_id, asset_id, target_type, target_id, role, sort_order, caption, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        createId("link"),
        "default",
        assetId,
        "draft",
        asset.draftId,
        asset.role,
        0,
        asset.caption,
        asset.createdAt,
      );

      db.prepare(`
        INSERT INTO draft_image_assets (
          id, draft_id, asset_id, role, status, local_path, public_path, prompt,
          revised_prompt, alt, caption, model, size, error, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        asset.id,
        asset.draftId,
        assetId,
        asset.role,
        asset.status,
        asset.localPath,
        asset.publicPath,
        asset.prompt,
        asset.revisedPrompt,
        asset.alt,
        asset.caption,
        asset.model,
        asset.size,
        asset.error,
        asset.createdAt,
        asset.updatedAt,
      );

      return asset;
    },

    updateAsset(id: string, input: Partial<DraftImageAssetInput>): DraftImageAsset | null {
      const current = this.getAsset(id);
      if (!current) {
        return null;
      }
      const next: DraftImageAsset = {
        ...current,
        ...input,
        id: current.id,
        draftId: input.draftId ?? current.draftId,
        createdAt: current.createdAt,
        updatedAt: nowIso(),
      };
      db.prepare(`
        UPDATE draft_image_assets
        SET draft_id = ?, role = ?, status = ?, local_path = ?, public_path = ?,
          prompt = ?, revised_prompt = ?, alt = ?, caption = ?, model = ?,
          size = ?, error = ?, updated_at = ?
        WHERE id = ?
      `).run(
        next.draftId,
        next.role,
        next.status,
        next.localPath,
        next.publicPath,
        next.prompt,
        next.revisedPrompt,
        next.alt,
        next.caption,
        next.model,
        next.size,
        next.error,
        next.updatedAt,
        next.id,
      );
      return this.getAsset(id);
    },

    getAsset(id: string): DraftImageAsset | null {
      const row = db.prepare("SELECT * FROM draft_image_assets WHERE id = ?").get(id) as
        | DraftImageAssetRow
        | undefined;
      return row ? mapDraftImageAsset(row) : null;
    },

    listAssets(draftId?: string): DraftImageAsset[] {
      const rows = draftId
        ? (db
            .prepare("SELECT * FROM draft_image_assets WHERE draft_id = ? ORDER BY created_at ASC")
            .all(draftId) as DraftImageAssetRow[])
        : (db.prepare("SELECT * FROM draft_image_assets ORDER BY created_at DESC").all() as DraftImageAssetRow[]);
      return rows.map(mapDraftImageAsset);
    },
  };
}

function mapDraftImageAsset(row: DraftImageAssetRow): DraftImageAsset {
  return {
    id: row.id,
    draftId: row.draft_id,
    role: row.role,
    status: row.status,
    localPath: row.local_path,
    publicPath: row.public_path,
    prompt: row.prompt,
    revisedPrompt: row.revised_prompt,
    alt: row.alt,
    caption: row.caption,
    model: row.model,
    size: row.size,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
