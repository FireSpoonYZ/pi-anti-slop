import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { replaceAssistantTextBlocks } from "../src/index.js";

function assistant(): AssistantMessage {
  return {
    role: "assistant",
    content: [
      { type: "text", text: "before" },
      {
        type: "toolCall",
        id: "call_1",
        name: "read",
        arguments: { path: "/etc/hostname", offset: 3 },
      },
      { type: "text", text: "after" },
    ],
    api: "openai-completions",
    provider: "mock",
    model: "main",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "toolUse",
    timestamp: Date.now(),
  } as AssistantMessage;
}

test("replacing text blocks preserves tool calls byte-for-byte at the message-object level", () => {
  const original = assistant();
  const originalTool = structuredClone(original.content[1]);

  const rewritten = replaceAssistantTextBlocks(original, ["new before", "new after"]);

  assert.equal(rewritten.content[0]?.type, "text");
  assert.equal((rewritten.content[0] as any).text, "new before");
  assert.deepEqual(rewritten.content[1], originalTool);
  assert.equal(rewritten.content[2]?.type, "text");
  assert.equal((rewritten.content[2] as any).text, "new after");
});
