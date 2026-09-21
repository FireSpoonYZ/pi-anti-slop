import assert from "node:assert/strict";
import test from "node:test";
import {
  HUMANIZER_COMMIT,
  HUMANIZER_PATTERNS,
  HUMANIZER_VERSION,
  NOUL_TRUE_THRESHOLD,
  buildHumanizerRewriteSystemPrompt,
  decideHumanizer,
  extractHumanizerFinal,
  type HumanizerAssessment,
} from "../src/humanizer.js";

function assessment(scores: Array<[number, number]>): HumanizerAssessment {
  const map = new Map(scores);
  return {
    scores: HUMANIZER_PATTERNS.map((pattern) => {
      const probability = map.get(pattern.number) ?? 0.1;
      return { pattern, probability, present: probability > NOUL_TRUE_THRESHOLD };
    }),
  };
}

test("loads the pinned Humanizer 3.0.0 catalogue", () => {
  assert.equal(HUMANIZER_VERSION, "3.0.0");
  assert.equal(HUMANIZER_COMMIT, "9862685f575c65a8247f90369951df1b3416e3d6");
  assert.equal(HUMANIZER_PATTERNS.length, 25);
  assert.deepEqual(
    HUMANIZER_PATTERNS.filter((pattern) => pattern.oneSighting).map((pattern) => pattern.number),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    HUMANIZER_PATTERNS.filter((pattern) => pattern.weakAlone).map((pattern) => pattern.number),
    [8, 9, 10, 11, 21],
  );
});

test("one-sighting Humanizer tell triggers a rewrite", () => {
  const result = decideHumanizer(assessment([[1, 0.51]]));
  assert.equal(result.rewrite, true);
  assert.match(result.reason, /one-sighting/);
});

test("a non-weak marked Humanizer tell triggers a rewrite", () => {
  const result = decideHumanizer(assessment([[12, 0.7]]));
  assert.equal(result.rewrite, true);
  assert.match(result.reason, /marked tell §12/);
});

test("weak-alone scores are actionable only after Jev applies Humanizer's same-passage company rule", () => {
  const isolated = decideHumanizer(assessment([[8, 0.49]]));
  assert.equal(isolated.rewrite, false);

  const actionable = decideHumanizer(assessment([[8, 0.9]]));
  assert.equal(actionable.rewrite, true);
  assert.match(actionable.reason, /same-passage company/);
});

test("Noul 0.5 is not treated as a positive sighting", () => {
  const result = decideHumanizer(assessment([[1, 0.5]]));
  assert.equal(result.rewrite, false);
});

test("rewrite prompt embeds Humanizer and final markers", () => {
  const prompt = buildHumanizerRewriteSystemPrompt("<<<START>>>", "<<<END>>>");
  assert.match(prompt, /Humanizer: remove AI writing patterns/);
  assert.match(prompt, /Embedded mode/);
  assert.match(prompt, /<<<START>>>/);
  assert.match(prompt, /<<<END>>>/);
});

test("extracts exactly one Humanizer final payload", () => {
  assert.equal(
    extractHumanizerFinal("noise\n<<<START>>>\nfinal text\n<<<END>>>\nnoise", "<<<START>>>", "<<<END>>>"),
    "final text",
  );
  assert.throws(
    () => extractHumanizerFinal("<<<START>>>a<<<START>>>b<<<END>>>", "<<<START>>>", "<<<END>>>"),
    /duplicated/,
  );
});
