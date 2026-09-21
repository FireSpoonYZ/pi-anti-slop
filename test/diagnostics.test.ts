import assert from "node:assert/strict";
import test from "node:test";
import { formatLastAssessment } from "../src/diagnostics.js";
import {
  HUMANIZER_PATTERNS,
  decideHumanizer,
  type HumanizerAssessment,
} from "../src/humanizer.js";

function makeAssessment(): HumanizerAssessment {
  return {
    scores: HUMANIZER_PATTERNS.map((pattern) => ({
      pattern,
      probability: pattern.number === 1 ? 0.91 : pattern.number === 8 ? 0.62 : 0.1,
      present: pattern.number === 1 || pattern.number === 8,
    })),
  };
}

test("formats no-assessment state", () => {
  assert.match(formatLastAssessment(undefined), /no Jev assessment/);
});

test("formats Humanizer decision and all pattern probabilities", () => {
  const assessment = makeAssessment();
  const text = formatLastAssessment({
    timestamp: 1,
    mode: "final",
    stopReason: "stop",
    rewriteModel: "mock/rewrite:high",
    result: "rewritten",
    assessment,
    decision: decideHumanizer(assessment),
  });

  assert.match(text, /Humanizer=3\.0\.0@9862685/);
  assert.match(text, /decision=REWRITE/);
  assert.match(text, /§01 Not X but Y\s+0\.910\s+HIT ONE-SIGHTING/);
  assert.match(text, /§08 Dashes as the universal connector\s+0\.620\s+HIT WEAK-ALONE/);
});
