import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_HUMANIZER_PATTERNS,
  HUMANIZER_TECHNICAL_PATTERNS,
} from "../src/humanizer.js";
import { assessHumanizerPatterns } from "../src/jev.js";

test("sends all 33 Humanizer + Technical patterns in one Jev request", async () => {
  let requestBody: any;
  const fetchImpl: typeof fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body));
    const answers: Record<string, unknown> = {};
    for (const pattern of ALL_HUMANIZER_PATTERNS) {
      answers[pattern.key] = {
        noul: pattern.label === "§1" ? 0.91 : pattern.label === "T3" ? 0.88 : 0.1,
      };
    }
    return new Response(JSON.stringify({ answers }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await assessHumanizerPatterns("user", "assistant", {
    apiKey: "test",
    endpoint: "http://mock/systemone",
    fetchImpl,
  });

  assert.equal(requestBody.state.user_request, "user");
  assert.equal(requestBody.state.assistant_response, "assistant");
  assert.match(requestBody.state.humanizer_skill, /metadata:\n  version: "3\.0\.0"/);
  assert.match(requestBody.state.humanizer_technical_skill, /name: humanizer-technical/);
  assert.equal(Object.keys(requestBody.questions).length, 33);
  assert.equal(result.scores.length, 33);

  const base = result.scores.find((score) => score.pattern.label === "§1");
  const technical = result.scores.find((score) => score.pattern.label === "T3");
  assert.equal(base?.probability, 0.91);
  assert.equal(base?.present, true);
  assert.equal(technical?.probability, 0.88);
  assert.equal(technical?.present, true);

  const t3 = HUMANIZER_TECHNICAL_PATTERNS.find((pattern) => pattern.label === "T3")!;
  assert.match(
    requestBody.questions[t3.key].instructions,
    /full document shape, section proportions, tables\/lists/,
  );
  assert.match(requestBody.questions[t3.key].instructions, /false-positive guard exactly/);
});

test("Jev errors are surfaced", async () => {
  const fetchImpl: typeof fetch = async () => new Response("overloaded", { status: 529 });
  await assert.rejects(
    assessHumanizerPatterns("u", "a", { apiKey: "test", fetchImpl }),
    /HTTP 529/,
  );
});
