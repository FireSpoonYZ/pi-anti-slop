import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { shouldProcessAssistant } from "../src/policy.js";

function message(stopReason: AssistantMessage["stopReason"], withText = true): AssistantMessage {
  return {
    role: "assistant",
    content: withText ? [{ type: "text", text: "hello" }] : [{ type: "thinking", thinking: "hmm" }],
    api: "openai-completions",
    provider: "mock",
    model: "mock",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    timestamp: Date.now(),
  } as AssistantMessage;
}

test("off mode never processes assistant output", () => {
  assert.equal(shouldProcessAssistant(message("stop"), "off"), false);
  assert.equal(shouldProcessAssistant(message("toolUse"), "off"), false);
});

test("final mode only processes normal final assistant output", () => {
  assert.equal(shouldProcessAssistant(message("stop"), "final"), true);
  assert.equal(shouldProcessAssistant(message("toolUse"), "final"), false);
  assert.equal(shouldProcessAssistant(message("length"), "final"), false);
});

test("all mode processes completed text turns but skips failure/control states", () => {
  assert.equal(shouldProcessAssistant(message("stop"), "all"), true);
  assert.equal(shouldProcessAssistant(message("toolUse"), "all"), true);
  assert.equal(shouldProcessAssistant(message("length"), "all"), true);
  assert.equal(shouldProcessAssistant(message("error"), "all"), false);
  assert.equal(shouldProcessAssistant(message("aborted"), "all"), false);
  assert.equal(shouldProcessAssistant(message("deferred"), "all"), false);
  assert.equal(shouldProcessAssistant(message("pending"), "all"), false);
  assert.equal(shouldProcessAssistant(message("stop", false), "all"), false);
});
