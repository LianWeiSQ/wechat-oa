# Professional WeChat Article Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a professional WeChat article generator that turns an imported AI article plus analysis into a polished long-form draft with `gpt-image-2` generated images inserted into the draft.

**Architecture:** Keep text generation on the existing OpenAI-compatible chat path and add a separate OpenAI Images API client for `gpt-image-2`. Persist drafts in the existing `drafts` table, generated image metadata in a new `draft_image_assets` table, and image files under `data/generated-images`.

**Tech Stack:** Next.js App Router, React client component, TypeScript, SQLite via `node:sqlite`, Vitest, Testing Library, OpenAI-compatible Chat Completions, OpenAI Images API.

**Implementation Status:** Core implementation is complete through data model, writer, image client, orchestration, API routes, and workbench UI. Verification passed with `pnpm test`, `pnpm lint`, `pnpm build`, and a browser smoke check on `http://127.0.0.1:3002`.

---

## File Structure

- Modify `src/lib/types.ts`: add `ImageSettings`, `PublicImageSettings`, `DraftImageAsset`, and professional draft writer types.
- Modify `src/lib/db.ts`: add `draft_image_assets` migration and indexes.
- Modify `src/lib/settings.ts`: add image settings defaults, encrypted API key persistence, and public masking.
- Modify `src/lib/drafts.ts`: add `updateDraftBody`.
- Create `src/lib/draft-images.ts`: CRUD for generated image asset metadata.
- Create `src/lib/article-writer.ts`: writer prompt, structured parsing, and text model call wrapper.
- Create `src/lib/image-generation.ts`: image API call, `b64_json` decoding, and local file persistence.
- Modify `src/app/api/_helpers.ts`: expose `draftImageStore`.
- Create `src/app/api/settings/image/route.ts`: get and update image settings.
- Create `src/app/api/assets/images/[file]/route.ts`: serve generated local image assets safely.
- Create `src/app/api/articles/[id]/professional-draft/route.ts`: orchestrate article writing, draft persistence, image generation, and response.
- Modify `src/app/page.tsx`: pass initial image settings into the workbench.
- Modify `src/components/workbench.tsx`: add image settings UI, professional draft action, progress messages, and generated image cards.
- Add tests:
  - `src/lib/__tests__/article-writer.test.ts`
  - `src/lib/__tests__/image-settings-and-assets.test.ts`
  - `src/lib/__tests__/image-generation.test.ts`
  - update `src/components/__tests__/workbench.test.tsx`

---

### Task 1: Data Model, Settings, And Image Asset Store

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/db.ts`
- Modify: `src/lib/settings.ts`
- Modify: `src/lib/drafts.ts`
- Create: `src/lib/draft-images.ts`
- Test: `src/lib/__tests__/image-settings-and-assets.test.ts`

- [ ] **Step 1: Write failing persistence tests**

Add tests that expect image settings masking and asset persistence:

```ts
import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db";
import { createDraftStore } from "@/lib/drafts";
import { createDraftImageStore } from "@/lib/draft-images";
import { createSettingsStore } from "@/lib/settings";

describe("image settings and draft image assets", () => {
  it("returns default image settings with a masked API key", () => {
    const db = openDatabase(":memory:");
    const settingsStore = createSettingsStore(db);
    const settings = settingsStore.getImageSettings();
    expect(settings.baseUrl).toBe("https://api.openai.com/v1");
    expect(settings.model).toBe("gpt-image-2");
    expect(settings.size).toBe("1536x1024");
    expect(settingsStore.getPublicImageSettings()).toMatchObject({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-image-2",
      size: "1536x1024",
      hasApiKey: false,
    });
  });

  it("saves image settings without exposing the API key publicly", () => {
    const db = openDatabase(":memory:");
    const settingsStore = createSettingsStore(db);
    settingsStore.saveImageSettings({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-local",
      model: "gpt-image-2",
      size: "1024x1024",
    });
    expect(settingsStore.getImageSettings().apiKey).toBe("sk-local");
    expect(settingsStore.getPublicImageSettings()).toMatchObject({
      hasApiKey: true,
      model: "gpt-image-2",
      size: "1024x1024",
    });
  });

  it("persists generated and failed image asset records", () => {
    const db = openDatabase(":memory:");
    const draftStore = createDraftStore(db);
    const imageStore = createDraftImageStore(db);
    const draft = draftStore.createDraft({
      title: "AI Agent 工程化",
      body: "<h1>AI Agent 工程化</h1>",
      sourceAnalysisIds: ["run_1"],
      exportFormat: "html",
    });
    const asset = imageStore.createAsset({
      draftId: draft.id,
      role: "hero",
      status: "generated",
      localPath: "/tmp/hero.png",
      publicPath: "/api/assets/images/hero.png",
      prompt: "technical magazine cover",
      revisedPrompt: "",
      alt: "AI Agent 工程化封面",
      caption: "AI Agent 工程化不是聊天能力，而是控制系统。",
      model: "gpt-image-2",
      size: "1536x1024",
      error: "",
    });
    expect(imageStore.listAssets(draft.id)).toEqual([asset]);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm test src/lib/__tests__/image-settings-and-assets.test.ts`

Expected: fail because `createDraftImageStore`, `getImageSettings`, and related types do not exist.

- [ ] **Step 3: Implement settings, migration, and asset store**

Implement:

```ts
export type ImageSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
  size: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
};

export type PublicImageSettings = Omit<ImageSettings, "apiKey"> & {
  hasApiKey: boolean;
};

export type DraftImageAsset = {
  id: string;
  draftId: string;
  role: "hero" | "explanation";
  status: "pending" | "generated" | "failed";
  localPath: string;
  publicPath: string;
  prompt: string;
  revisedPrompt: string;
  alt: string;
  caption: string;
  model: string;
  size: ImageSettings["size"];
  error: string;
  createdAt: string;
  updatedAt: string;
};
```

Add a `draft_image_assets` table with columns matching `DraftImageAsset`, and add store methods `createAsset`, `updateAsset`, `listAssets`.

- [ ] **Step 4: Run test to verify GREEN**

Run: `pnpm test src/lib/__tests__/image-settings-and-assets.test.ts`

Expected: pass.

---

### Task 2: Professional Article Writer

**Files:**
- Create: `src/lib/article-writer.ts`
- Test: `src/lib/__tests__/article-writer.test.ts`

- [ ] **Step 1: Write failing writer tests**

Tests should verify prompt quality and structured parsing:

```ts
import { describe, expect, it } from "vitest";
import { createProfessionalDraftRequest, generateProfessionalArticleDraft, parseProfessionalDraftResponse } from "@/lib/article-writer";
import type { AiSettings, AnalysisRun, Article } from "@/lib/types";

const article: Article = {
  id: "art_1",
  title: "AI Agent 落地难在哪里",
  sourceAccount: "AI Research",
  originalUrl: "local://1",
  author: "William",
  publishedAt: "2026-05-14",
  content: "很多团队发现 Agent demo 很强，但上线后卡在权限、审计和回滚。",
  tags: ["agent"],
  createdAt: "now",
  updatedAt: "now",
};

const run: AnalysisRun = {
  id: "run_1",
  articleId: "art_1",
  templateId: "technical-deep-dive",
  templateName: "技术深挖",
  lens: "硬核技术读者",
  summary: "Agent 的核心难点是工程控制面。",
  technicalInsights: ["需要工具权限边界", "需要可观测和回滚"],
  risks: ["模型误调用工具", "成本不可控"],
  reusableAngles: ["Agent 工程化", "控制面"],
  viralScore: { total: 88, dimensions: { pain: 22, novelty: 21, evidence: 23, debate: 22 }, reasons: ["痛点强"] },
  topicCandidates: [],
  modelMetadata: { provider: "openai-compatible", model: "gpt-5.2" },
  createdAt: "now",
};

describe("professional article writer", () => {
  it("builds a Harness-like but WeChat-readable writing prompt", () => {
    const request = createProfessionalDraftRequest(article, run, "gpt-5.2");
    const prompt = request.messages.map((message) => message.content).join("\\n");
    expect(prompt).toContain("生产约束");
    expect(prompt).toContain("架构取舍");
    expect(prompt).toContain("失败模式");
    expect(prompt).toContain("不要使用 首先/其次/综上");
    expect(prompt).toContain("imageBriefs");
  });

  it("parses structured draft output and preserves image briefs", () => {
    const parsed = parseProfessionalDraftResponse(JSON.stringify({
      title: "AI Agent 真正难的是工程化",
      deck: "会聊天不等于能上线。",
      bodyHtml: "<h1>AI Agent 真正难的是工程化</h1><p>上线难在控制面。</p>",
      pullQuotes: ["自由度越高，越需要工程边界。"],
      imageBriefs: [
        { role: "hero", prompt: "technical magazine cover", alt: "封面", caption: "封面说明" },
        { role: "explanation", prompt: "architecture diagram", alt: "架构图", caption: "架构说明" },
      ],
    }));
    expect(parsed.imageBriefs).toHaveLength(2);
    expect(parsed.bodyHtml).toContain("<h1>");
  });

  it("generates a structured draft with an injected model client", async () => {
    const settings: AiSettings = { baseUrl: "http://127.0.0.1:8787/v1", apiKey: "codex-local", model: "gpt-5.2" };
    const draft = await generateProfessionalArticleDraft(article, run, settings, async () => JSON.stringify({
      title: "AI Agent 真正难的是工程化",
      deck: "会聊天不等于能上线。",
      bodyHtml: "<h1>AI Agent 真正难的是工程化</h1><p>上线难在控制面。</p>",
      pullQuotes: [],
      imageBriefs: [{ role: "hero", prompt: "technical cover", alt: "封面", caption: "说明" }],
    }));
    expect(draft.title).toBe("AI Agent 真正难的是工程化");
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm test src/lib/__tests__/article-writer.test.ts`

Expected: fail because `article-writer.ts` does not exist.

- [ ] **Step 3: Implement writer**

Create a Zod-backed parser, prompt builder, and generator that reuses `callOpenAICompatible`.

- [ ] **Step 4: Run test to verify GREEN**

Run: `pnpm test src/lib/__tests__/article-writer.test.ts`

Expected: pass.

---

### Task 3: Image Generation Client

**Files:**
- Create: `src/lib/image-generation.ts`
- Test: `src/lib/__tests__/image-generation.test.ts`

- [ ] **Step 1: Write failing image generation tests**

Test that the client calls `/images/generations`, decodes `b64_json`, and writes a PNG:

```ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateDraftImage } from "@/lib/image-generation";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
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
      settings: { baseUrl: "https://api.openai.com/v1", apiKey: "sk-test", model: "gpt-image-2", size: "1536x1024" },
      outputDir: dir,
      fetcher: async (url, init) => {
        expect(String(url)).toBe("https://api.openai.com/v1/images/generations");
        expect(JSON.parse(String(init?.body)).model).toBe("gpt-image-2");
        return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }] }), { status: 200 });
      },
    });
    expect(readFileSync(result.localPath, "utf8")).toBe("png-bytes");
    expect(result.publicPath).toContain("/api/assets/images/");
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm test src/lib/__tests__/image-generation.test.ts`

Expected: fail because `image-generation.ts` does not exist.

- [ ] **Step 3: Implement image client**

Implement `generateDraftImage` with an injected `fetcher`, missing-key validation, `b64_json` decoding, safe filenames, and local file write into `data/generated-images`.

- [ ] **Step 4: Run test to verify GREEN**

Run: `pnpm test src/lib/__tests__/image-generation.test.ts`

Expected: pass.

---

### Task 4: API Routes And Orchestration

**Files:**
- Modify: `src/app/api/_helpers.ts`
- Create: `src/app/api/settings/image/route.ts`
- Create: `src/app/api/assets/images/[file]/route.ts`
- Create: `src/app/api/articles/[id]/professional-draft/route.ts`
- Modify: `src/lib/drafts.ts`

- [ ] **Step 1: Cover route behavior through library and UI tests**

Use library tests for orchestration primitives; for route files, rely on build/typecheck because current API route tests are not established.

- [ ] **Step 2: Implement API helper and settings route**

Expose `draftImageStore` from `stores()`. Add `GET` and `PUT` handlers for image settings:

```ts
export async function GET() {
  const { settingsStore } = stores();
  return Response.json({ settings: settingsStore.getPublicImageSettings() });
}
```

- [ ] **Step 3: Implement image asset route**

Reject unsafe filenames, read from `data/generated-images`, and return `image/png`.

- [ ] **Step 4: Implement professional draft route**

The route should:

1. load article
2. pick the requested analysis run or latest run for the article
3. call `generateProfessionalArticleDraft`
4. create a draft
5. create pending image asset records
6. call `generateDraftImage` for each brief
7. update image assets to generated or failed
8. update draft body with generated `<figure>` blocks
9. return `{ draft, imageAssets, professionalDraft }`

---

### Task 5: Workbench UI

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/workbench.tsx`
- Test: `src/components/__tests__/workbench.test.tsx`

- [ ] **Step 1: Write failing UI test**

Extend the workbench test to expect:

```ts
expect(screen.getByRole("button", { name: /生成专业长文/ })).toBeInTheDocument();
expect(screen.getByText("图片模型配置")).toBeInTheDocument();
```

- [ ] **Step 2: Run UI test to verify RED**

Run: `pnpm test src/components/__tests__/workbench.test.tsx`

Expected: fail because the button and image settings section are absent.

- [ ] **Step 3: Implement UI**

Add props and state for `initialImageSettings`; add `handleSaveImageSettings` and `handleProfessionalDraft`; show progress, image asset cards, and prompt/error details.

- [ ] **Step 4: Run UI test to verify GREEN**

Run: `pnpm test src/components/__tests__/workbench.test.tsx`

Expected: pass.

---

### Task 6: Documentation, Verification, And Polish

**Files:**
- Modify: `docs/superpowers/specs/2026-05-14-professional-wechat-article-generation-design.md`
- Modify: this plan file if implementation details change

- [ ] **Step 1: Update docs with implementation notes**

Record actual defaults:

- image model: `gpt-image-2`
- image endpoint: `/v1/images/generations`
- default size: `1536x1024`
- generated image directory: `data/generated-images`

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm test src/lib/__tests__/image-settings-and-assets.test.ts src/lib/__tests__/article-writer.test.ts src/lib/__tests__/image-generation.test.ts src/components/__tests__/workbench.test.tsx
```

Expected: all pass.

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm test
pnpm lint
pnpm build
```

Expected: all pass.

- [ ] **Step 4: Browser smoke test**

Open `http://127.0.0.1:3002`, verify the workbench shows:

- “生成专业长文 + 配图”
- image settings
- draft/image status after a mocked or missing-key run

Expected: UI renders without overlapping text or console-breaking errors.
