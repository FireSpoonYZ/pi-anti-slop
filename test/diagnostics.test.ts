import assert from "node:assert/strict";
import test from "node:test";
import { formatLastAssessment } from "../src/diagnostics.js";

test("formats no-assessment state", () => {
  assert.match(formatLastAssessment(undefined), /no Jev assessment/);
});

test("formats style, validation, result, and error details", () => {
  const text = formatLastAssessment({
    timestamp: 1,
    mode: "final",
    stopReason: "stop",
    rewriteModel: "mock/rewrite:high",
    rewriteThreshold: 0.72,
    validationThreshold: 0.84,
    result: "validation-fallback",
    style: {
      shouldRewrite: 0.91,
      probabilities: {
        should_rewrite: 0.91,
        formatting_overuse: 0.82,
        coined_jargon: 0.12,
      },
      hits: [{ id: "formatting_overuse", probability: 0.82 }],
    },
    validation: {
      meaningPreserved: 0.93,
      noNewFacts: 0.77,
      technicalLiteralsPreserved: 0.99,
    },
    error: "rewrite failed validation",
  });

  assert.match(text, /result=validation-fallback/);
  assert.match(text, /should_rewrite=0\.910/);
  assert.match(text, /formatting_overuse\s+0\.820/);
  assert.match(text, /no_new_facts\s+0\.770/);
  assert.match(text, /rewrite failed validation/);
});
