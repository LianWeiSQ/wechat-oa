import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getSupabaseConfig, getSupabaseServiceClient } from "@/lib/supabase";

export type StoredImage = {
  localPath: string;
  publicPath: string;
  objectKey: string;
  sha256: string;
  byteSize: number;
  mimeType: string;
};

export function getGeneratedImageDir(): string {
  return join(process.cwd(), "data", "generated-images");
}

function getGeneratedImagePath(fileName: string): string {
  return join(/*turbopackIgnore: true*/ process.cwd(), "data", "generated-images", fileName);
}

export function isSafeImageFileName(fileName: string): boolean {
  return /^[a-zA-Z0-9_-]+\.(?:png|jpg|jpeg|webp|gif)$/i.test(fileName);
}

export async function storeGeneratedImage(input: {
  fileName: string;
  bytes: Buffer;
  outputDir?: string;
  mimeType?: string;
}): Promise<StoredImage> {
  const mimeType = input.mimeType ?? mimeTypeFromFileName(input.fileName);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const supabaseConfig = getSupabaseConfig();

  if (supabaseConfig && !input.outputDir) {
    const objectKey = `workspaces/${supabaseConfig.defaultWorkspaceId}/assets/${input.fileName}`;
    const { error } = await getSupabaseServiceClient()
      .storage
      .from(supabaseConfig.storageBucket)
      .upload(objectKey, input.bytes, {
        contentType: mimeType,
        upsert: true,
      });
    if (error) {
      throw new Error(`上传图片到 Supabase Storage 失败：${error.message}`);
    }

    return {
      localPath: objectKey,
      objectKey,
      publicPath: `/api/assets/images/${input.fileName}`,
      sha256,
      byteSize: input.bytes.byteLength,
      mimeType,
    };
  }

  const outputDir = input.outputDir ?? getGeneratedImageDir();
  mkdirSync(outputDir, { recursive: true });
  const localPath = input.outputDir ? join(input.outputDir, input.fileName) : getGeneratedImagePath(input.fileName);
  await writeFile(localPath, input.bytes);
  return {
    localPath,
    objectKey: input.fileName,
    publicPath: `/api/assets/images/${input.fileName}`,
    sha256,
    byteSize: input.bytes.byteLength,
    mimeType,
  };
}

export async function readGeneratedImage(fileName: string): Promise<{ bytes: Buffer; mimeType: string }> {
  if (!isSafeImageFileName(fileName)) {
    throw new Error("图片文件名不合法");
  }

  const supabaseConfig = getSupabaseConfig();
  if (supabaseConfig) {
    const objectKey = `workspaces/${supabaseConfig.defaultWorkspaceId}/assets/${fileName}`;
    const { data, error } = await getSupabaseServiceClient()
      .storage
      .from(supabaseConfig.storageBucket)
      .download(objectKey);
    if (error) {
      throw new Error(`图片不存在：${error.message}`);
    }
    return {
      bytes: Buffer.from(await data.arrayBuffer()),
      mimeType: data.type || mimeTypeFromFileName(fileName),
    };
  }

  return {
    bytes: await readFile(getGeneratedImagePath(fileName)),
    mimeType: mimeTypeFromFileName(fileName),
  };
}

function mimeTypeFromFileName(fileName: string): string {
  if (/\.jpe?g$/i.test(fileName)) {
    return "image/jpeg";
  }
  if (/\.webp$/i.test(fileName)) {
    return "image/webp";
  }
  if (/\.gif$/i.test(fileName)) {
    return "image/gif";
  }
  return "image/png";
}
