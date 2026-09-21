import assert from "node:assert/strict";
import test from "node:test";
import { HUMANIZER_PATTERNS } from "../src/humanizer.js";
import { assessHumanizerPatterns } from "../src/jev.js";

test("sends all 25 Humanizer patterns in one Jev request", async () => {
  let requestBody: any;
  const fetchImpl: typeof fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body));
    const answers: Record<string, unknown> = {};
    for (const pattern of HUMANIZER_PATTERNS) {
      answers[pattern.key] = {
        noul: pattern.number === 1 ? 0.91 : pattern.number === 8 ? 0.5 : 0.1,
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
  assert.equal(Object.keys(requestBody.questions).length, 25);
  assert.equal(result.scores.length, 25);
  assert.equal(result.scores[0]?.probability, 0.91);
  assert.equal(result.scores[0]?.present, true);
  assert.equal(result.scores[7]?.probability, 0.5);
  assert.equal(result.scores[7]?.present, false);
});

test("Jev errors are surfaced", async () => {
  const fetchImpl: typeof fetch = async () => new Response("overloaded", { status: 529 });
  await assert.rejects(
    assessHumanizerPatterns("u", "a", { apiKey: "test", fetchImpl }),
    /HTTP 529/,
  );
});
