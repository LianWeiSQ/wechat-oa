#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_HOST = process.env.CODEX_BRIDGE_HOST ?? "127.0.0.1";
export const DEFAULT_PORT = Number(process.env.CODEX_BRIDGE_PORT ?? "3000");
export const DEFAULT_API_KEY = process.env.CODEX_BRIDGE_API_KEY ?? process.env.OPENAI_API_KEY ?? "codex-local";
export const DEFAULT_MODEL = process.env.CODEX_BRIDGE_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.4";

export function isAuthorized(headers, apiKey = DEFAULT_API_KEY) {
  const authorization = headers.get("authorization") ?? "";
  const xApiKey = headers.get("x-api-key") ?? "";
  return authorization === `Bearer ${apiKey}` || xApiKey === apiKey;
}

export function buildCodexPrompt(messages) {
  const renderedMessages = messages
    .map((message) => {
      const content = renderContent(message.content);
      return `<${message.role}>\n${content}\n</${message.role}>`;
    })
    .join("\n\n");

  return [
    "You are a local OpenAI-compatible chat completions bridge backed by Codex CLI.",
    "Return only the assistant response content. Do not include commentary about Codex, tools, or the bridge.",
    "Do not run shell commands, inspect files, browse the web, or mutate local state.",
    "Use only the message content below to produce the response.",
    "",
    renderedMessages,
  ].join("\n");
}

export function toChatCompletionResponse({ content, model }) {
  return {
    id: `chatcmpl-codex-${Date.now().toString(36)}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

export function buildMessagesFromResponsesBody(body) {
  const messages = [];
  if (typeof body.instructions === "string" && body.instructions.trim()) {
    messages.push({ role: "system", content: body.instructions });
  }
  const input = Array.isArray(body.input) ? body.input : [{ role: "user", content: body.input ?? "" }];
  for (const item of input) {
    if (typeof item === "string") {
      messages.push({ role: "user", content: item });
      continue;
    }
    if (!item || typeof item !== "object") {
      continue;
    }
    messages.push({
      role: typeof item.role === "string" ? item.role : "user",
      content: renderResponsesContent(item.content),
    });
  }
  return messages;
}

export function toResponsesResponse({ content, model }) {
  return {
    id: `resp_codex_${Date.now().toString(36)}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model,
    output_text: content,
    output: [
      {
        id: `msg_codex_${Date.now().toString(36)}`,
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: content }],
      },
    ],
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    },
  };
}

export function createBridgeServer(options = {}) {
  const apiKey = options.apiKey ?? DEFAULT_API_KEY;
  const defaultModel = options.defaultModel ?? DEFAULT_MODEL;
  const codexBin = options.codexBin ?? "codex";
  const timeoutMs = options.timeoutMs ?? Number(process.env.CODEX_BRIDGE_TIMEOUT_MS ?? "180000");

  return createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
      setCorsHeaders(response);

      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      if (url.pathname === "/health" && request.method === "GET") {
        sendJson(response, 200, { ok: true, service: "wechat-oa-codex-bridge", model: defaultModel });
        return;
      }

      if ((url.pathname === "/v1/models" || url.pathname === "/models") && request.method === "GET") {
        sendJson(response, 200, {
          object: "list",
          data: [
            { id: "gpt-5.2", object: "model", owned_by: "codex-cli" },
            { id: "gpt-5.5", object: "model", owned_by: "codex-cli" },
          ],
        });
        return;
      }

      if (
        (url.pathname === "/v1/chat/completions" || url.pathname === "/chat/completions") &&
        request.method === "POST"
      ) {
        if (!isAuthorized(new Headers(request.headers), apiKey)) {
          sendJson(response, 401, { error: { message: "Unauthorized", type: "invalid_request_error" } });
          return;
        }

        const body = await readJsonBody(request);
        if (!Array.isArray(body.messages)) {
          sendJson(response, 400, { error: { message: "messages must be an array", type: "invalid_request_error" } });
          return;
        }
        if (body.stream) {
          sendJson(response, 400, { error: { message: "stream=true is not supported by codex bridge yet" } });
          return;
        }

        const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : defaultModel;
        const content = await runCodex(buildCodexPrompt(body.messages), {
          model,
          codexBin,
          timeoutMs,
        });
        sendJson(response, 200, toChatCompletionResponse({ content, model }));
        return;
      }

      if ((url.pathname === "/v1/responses" || url.pathname === "/responses") && request.method === "POST") {
        if (!isAuthorized(new Headers(request.headers), apiKey)) {
          sendJson(response, 401, { error: { message: "Unauthorized", type: "invalid_request_error" } });
          return;
        }

        const body = await readJsonBody(request);
        if (body.stream) {
          sendJson(response, 400, { error: { message: "stream=true is not supported by codex bridge yet" } });
          return;
        }

        const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : defaultModel;
        const content = await runCodex(buildCodexPrompt(buildMessagesFromResponsesBody(body)), {
          model,
          codexBin,
          timeoutMs,
        });
        sendJson(response, 200, toResponsesResponse({ content, model }));
        return;
      }

      sendJson(response, 404, { error: { message: "Not found", type: "not_found_error" } });
    } catch (error) {
      sendJson(response, 500, {
        error: {
          message: error instanceof Error ? error.message : String(error),
          type: "server_error",
        },
      });
    }
  });
}

export async function runCodex(prompt, { model, codexBin = "codex", timeoutMs = 180000 } = {}) {
  const workDir = await mkdtemp(join(tmpdir(), "wechat-oa-codex-"));
  const outputPath = join(workDir, "last-message.txt");

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        codexBin,
        [
          "exec",
          "-m",
          model || DEFAULT_MODEL,
          "--sandbox",
          "read-only",
          "--skip-git-repo-check",
          "--ephemeral",
          "--output-last-message",
          outputPath,
          prompt,
        ],
        {
          cwd: workDir,
          env: {
            ...process.env,
            NO_COLOR: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      let stderr = "";
      let stdout = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Codex CLI timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Codex CLI failed with exit code ${code}: ${(stderr || stdout).slice(0, 1200)}`));
      });
    });

    return (await readFile(outputPath, "utf8")).trim();
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      throw new Error("Request body too large");
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function setCorsHeaders(response) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "authorization,content-type,x-api-key");
}

function renderContent(content) {
  if (typeof content === "string") {
    return content;
  }
  return JSON.stringify(content);
}

function renderResponsesContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return renderContent(content);
  }
  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (!part || typeof part !== "object") {
        return "";
      }
      if (typeof part.text === "string") {
        return part.text;
      }
      return JSON.stringify(part);
    })
    .filter(Boolean)
    .join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createBridgeServer();
  server.listen(DEFAULT_PORT, DEFAULT_HOST, () => {
    console.log(`Codex bridge listening on http://${DEFAULT_HOST}:${DEFAULT_PORT}/v1`);
    console.log(`Default model: ${DEFAULT_MODEL}`);
  });
}
