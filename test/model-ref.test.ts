import assert from "node:assert/strict";
import test from "node:test";
import type { Model } from "@earendil-works/pi-ai";
import { parseRewriteModelRef } from "../src/model-ref.js";

const models = new Set([
  "openai/gpt-test",
  "ollama/llama3.1:8b",
]);

const findModel = (provider: string, modelId: string) =>
  models.has(`${provider}/${modelId}`) ? ({ provider, id: modelId } as Model<any>) : undefined;

test("parses explicit thinking level suffix", () => {
  assert.deepEqual(parseRewriteModelRef("openai/gpt-test:high", findModel), {
    provider: "openai",
    modelId: "gpt-test",
    thinkingLevel: "high",
  });
});

test("does not confuse colon inside a model id with thinking level", () => {
  assert.deepEqual(parseRewriteModelRef("ollama/llama3.1:8b", findModel), {
    provider: "ollama",
    modelId: "llama3.1:8b",
  });
});

test("accepts off through max", () => {
  for (const level of ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const) {
    assert.equal(parseRewriteModelRef(`openai/gpt-test:${level}`, findModel)?.thinkingLevel, level);
  }
});

test("rejects unknown model when a thinking suffix is supplied", () => {
  assert.equal(parseRewriteModelRef("openai/missing:high", findModel), undefined);
});

test("rejects invalid thinking level suffix", () => {
  assert.equal(parseRewriteModelRef("openai/gpt-test:ultra", findModel), undefined);
});
