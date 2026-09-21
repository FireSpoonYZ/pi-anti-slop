import assert from "node:assert/strict";
import test from "node:test";
import { formatLastAssessment } from "../src/diagnostics.js";
import {
  ALL_HUMANIZER_PATTERNS,
  decideHumanizer,
  type HumanizerAssessment,
} from "../src/humanizer.js";

function makeAssessment(): HumanizerAssessment {
  return {
    scores: ALL_HUMANIZER_PATTERNS.map((pattern) => ({
      pattern,
      probability: pattern.label === "§1"
        ? 0.91
        : pattern.label === "§8"
          ? 0.62
          : pattern.label === "T3"
            ? 0.84
            : 0.1,
      present: pattern.label === "§1" || pattern.label === "§8" || pattern.label === "T3",
    })),
  };
}

test("formats no-assessment state", () => {
  assert.match(formatLastAssessment(undefined), /no Jev assessment/);
});

test("formats base and technical pattern probabilities", () => {
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

  assert.match(text, /Humanizer=3\.0\.0@9862685 \+ Technical=1\.0\.0/);
  assert.match(text, /decision=REWRITE/);
  assert.match(text, /§1\s+Not X but Y\s+0\.910\s+HIT ONE-SIGHTING/);
  assert.match(text, /§8\s+Dashes as the universal connector\s+0\.620\s+HIT WEAK-ALONE/);
  assert.match(text, /T3\s+Flat enumeration\s+0\.840\s+HIT/);
});
