import { describe, expect, it } from "vitest";
import {
  buildMessagesFromResponsesBody,
  buildCodexPrompt,
  isAuthorized,
  toChatCompletionResponse,
  toResponsesResponse,
} from "../codex-bridge.mjs";

describe("codex bridge helpers", () => {
  it("accepts the local bridge API key and rejects other bearer tokens", () => {
    expect(isAuthorized(new Headers({ authorization: "Bearer codex-local" }), "codex-local")).toBe(true);
    expect(isAuthorized(new Headers({ authorization: "Bearer wrong" }), "codex-local")).toBe(false);
  });

  it("builds a Codex prompt from OpenAI-compatible chat messages", () => {
    const prompt = buildCodexPrompt([
      { role: "system", content: "Only output JSON." },
      { role: "user", content: "Analyze this article." },
    ]);

    expect(prompt).toContain("Only output JSON.");
    expect(prompt).toContain("Analyze this article.");
    expect(prompt).toContain("Return only the assistant response content");
  });

  it("wraps Codex output as a chat completions response", () => {
    const response = toChatCompletionResponse({
      content: "{\"ok\":true}",
      model: "gpt-5.2",
    });

    expect(response.object).toBe("chat.completion");
    expect(response.model).toBe("gpt-5.2");
    expect(response.choices[0].message.content).toBe("{\"ok\":true}");
  });

  it("converts Responses API input into Codex chat messages", () => {
    const messages = buildMessagesFromResponsesBody({
      instructions: "Only output JSON.",
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: "Analyze this article." }],
        },
      ],
    });

    expect(messages).toEqual([
      { role: "system", content: "Only output JSON." },
      { role: "user", content: "Analyze this article." },
    ]);
  });

  it("wraps Codex output as a Responses API response", () => {
    const response = toResponsesResponse({
      content: "{\"ok\":true}",
      model: "gpt-5.4",
    });

    expect(response.object).toBe("response");
    expect(response.model).toBe("gpt-5.4");
    expect(response.output_text).toBe("{\"ok\":true}");
    expect(response.output[0].content[0].text).toBe("{\"ok\":true}");
  });
});
