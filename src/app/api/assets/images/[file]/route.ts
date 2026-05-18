import { isSafeImageFileName, readGeneratedImage } from "@/lib/image-storage";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  if (!isSafeImageFileName(file)) {
    return Response.json({ error: "图片文件名不合法" }, { status: 400 });
  }

  try {
    const image = await readGeneratedImage(file);
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        "content-type": image.mimeType,
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return Response.json({ error: "图片不存在" }, { status: 404 });
  }
}
