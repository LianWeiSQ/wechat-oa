import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateDraftImage } from "@/lib/image-generation";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe("image generation", () => {
  it("writes b64_json image data to a local file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wechat-oa-images-"));
    tempDirs.push(dir);

    const result = await generateDraftImage({
      draftId: "draft_1",
      role: "hero",
      prompt: "technical magazine cover",
      alt: "封面",
      caption: "说明",
      settings: {
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        model: "gpt-image-2",
        size: "1536x1024",
      },
      outputDir: dir,
      fetcher: async (url, init) => {
        expect(String(url)).toBe("https://api.openai.com/v1/images/generations");
        expect(JSON.parse(String(init?.body)).model).toBe("gpt-image-2");
        return new Response(
          JSON.stringify({ data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }] }),
          { status: 200 },
        );
      },
    });

    expect(readFileSync(result.localPath, "utf8")).toBe("png-bytes");
    expect(result.publicPath).toContain("/api/assets/images/");
    expect(result.model).toBe("gpt-image-2");
  });

  it("returns a failed asset payload when the image API key is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wechat-oa-images-"));
    tempDirs.push(dir);

    const result = await generateDraftImage({
      draftId: "draft_1",
      role: "explanation",
      prompt: "architecture diagram",
      alt: "架构图",
      caption: "说明",
      settings: {
        baseUrl: "https://api.openai.com/v1",
        apiKey: "",
        model: "gpt-image-2",
        size: "1536x1024",
      },
      outputDir: dir,
      fetcher: async () => {
        throw new Error("should not call");
      },
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("图片 API Key");
  });
});
