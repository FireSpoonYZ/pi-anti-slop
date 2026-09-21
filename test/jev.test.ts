import assert from "node:assert/strict";
import test from "node:test";
import { assessStyle, STYLE_RULES, validateRewrite } from "../src/jev.js";

test("assessStyle sends one parallel Jev request and parses noul probabilities", async () => {
  let requestBody: any;
  const fetchImpl: typeof fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body));
    const answers: Record<string, unknown> = {};
    for (const key of Object.keys(requestBody.questions)) {
      answers[key] = { noul: key === "should_rewrite" ? 0.93 : key === "coined_jargon" ? 0.81 : 0.12 };
    }
    return new Response(JSON.stringify({ answers }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await assessStyle("user", "assistant", {
    apiKey: "test",
    endpoint: "http://mock/systemone",
    fetchImpl,
  });

  assert.equal(requestBody.state.user_request, "user");
  assert.equal(requestBody.state.assistant_response, "assistant");
  assert.equal(Object.keys(requestBody.questions).length, Object.keys(STYLE_RULES).length + 1);
  assert.equal(result.shouldRewrite, 0.93);
  assert.deepEqual(result.hits, [{ id: "coined_jargon", probability: 0.81 }]);
});

test("validateRewrite parses the three safety gates", async () => {
  const fetchImpl: typeof fetch = async () => {
    return new Response(JSON.stringify({
      answers: {
        meaning_preserved: { noul: 0.97 },
        no_new_facts: { noul: 0.96 },
        technical_literals_preserved: { noul: 0.99 },
      },
    }), { status: 200 });
  };

  const result = await validateRewrite("before", "after", {
    apiKey: "test",
    fetchImpl,
  });

  assert.deepEqual(result, {
    meaningPreserved: 0.97,
    noNewFacts: 0.96,
    technicalLiteralsPreserved: 0.99,
  });
});

test("Jev errors are surfaced", async () => {
  const fetchImpl: typeof fetch = async () => new Response("overloaded", { status: 529 });
  await assert.rejects(
    assessStyle("u", "a", { apiKey: "test", fetchImpl }),
    /HTTP 529/,
  );
});
