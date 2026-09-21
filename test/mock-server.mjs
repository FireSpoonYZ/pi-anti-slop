import http from "node:http";

const port = Number(process.env.MOCK_PORT ?? 8787);

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function answerJev(body) {
  const answers = {};
  const state = body?.state ?? {};
  const isValidation = "rewritten_response" in state;
  const noRewrite = String(state.user_request ?? "").includes("[NO_REWRITE]");
  const validationFail = String(state.rewritten_response ?? "").includes("[VALIDATION_FAIL]");

  for (const key of Object.keys(body?.questions ?? {})) {
    let p = 0.08;
    if (isValidation) p = validationFail ? 0.2 : 0.99;
    else if (key === "should_rewrite") p = noRewrite ? 0.12 : 0.98;
    else if (key === "telegraphic_noun_stacking") p = 0.96;
    else if (key === "formatting_overuse") p = 0.88;
    else if (key === "canned_contrast") p = 0.82;
    answers[key] = { noul: p };
  }

  return { answers };
}

function extractLastUserMessage(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find((m) => m?.role === "user");
  if (!lastUser) return "";
  if (typeof lastUser.content === "string") return lastUser.content;
  if (Array.isArray(lastUser.content)) {
    return lastUser.content
      .filter((part) => part && (part.type === "text" || part.type === "input_text"))
      .map((part) => String(part.text ?? ""))
      .join("\n");
  }
  return "";
}

function extractLiteralTokens(text) {
  return [...text.matchAll(/__PI_ANTI_SLOP_LITERAL_\d+__/g)].map((m) => m[0]);
}

function beginStream(res) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    "connection": "keep-alive",
  });
}

function streamChat(res, model, text) {
  const id = `chatcmpl-${model}-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  beginStream(res);

  res.write(`data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{
      index: 0,
      delta: { role: "assistant", content: text },
      finish_reason: null,
    }],
  })}\n\n`);

  res.write(`data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{
      index: 0,
      delta: {},
      finish_reason: "stop",
    }],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 20,
      total_tokens: 40,
      prompt_tokens_details: { cached_tokens: 0 },
    },
  })}\n\n`);

  res.end("data: [DONE]\n\n");
}

function streamToolCall(res, model) {
  const id = `chatcmpl-${model}-tool-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  beginStream(res);

  res.write(`data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{
      index: 0,
      delta: {
        role: "assistant",
        content: "**Inspection Execution Layer:** Reading target system state before final synthesis.",
      },
      finish_reason: null,
    }],
  })}\n\n`);

  res.write(`data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{
          index: 0,
          id: "call_read_hostname",
          type: "function",
          function: { name: "read", arguments: "{\\\"path\\\":\\\"/etc/hostname\\\"}" },
        }],
      },
      finish_reason: null,
    }],
  })}\n\n`);

  res.write(`data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{
      index: 0,
      delta: {},
      finish_reason: "tool_calls",
    }],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 20,
      total_tokens: 40,
      prompt_tokens_details: { cached_tokens: 0 },
    },
  })}\n\n`);

  res.end("data: [DONE]\n\n");
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== "POST") {
      json(res, 404, { error: "not found" });
      return;
    }

    const body = await readJson(req);

    if (req.url === "/v1/systemone") {
      json(res, 200, answerJev(body));
      return;
    }

    if (req.url === "/v1/chat/completions") {
      const model = String(body?.model ?? "");
      console.log(`chat model=${model} reasoning_effort=${String(body?.reasoning_effort ?? "")}`);
      if (model === "main") {
        const prompt = extractLastUserMessage(body);
        const hasToolResult = Array.isArray(body?.messages)
          && body.messages.some((message) => message?.role === "tool");

        if (prompt.includes("[TOOL_USE]") && !hasToolResult) {
          streamToolCall(res, model);
          return;
        }

        if (prompt.includes("[TOOL_USE]") && hasToolResult) {
          streamChat(
            res,
            model,
            "**Final Synthesis Layer:** Tool inspection complete. The key is not verbosity, but directness.",
          );
          return;
        }

        streamChat(
          res,
          model,
          "**Core Execution Pipeline:** Model-output quality optimization. Run `cargo test`. The key is not speed, but quality. Then continue.",
        );
        return;
      }

      if (model === "rewrite") {
        const prompt = extractLastUserMessage(body);
        const tokens = extractLiteralTokens(prompt);
        const literalClause = tokens[0] ? ` Run ${tokens[0]}.` : "";
        const validationMarker = prompt.includes("[VALIDATION_FAIL]") ? " [VALIDATION_FAIL]" : "";
        streamChat(
          res,
          model,
          `Improve the wording without changing the substance.${literalClause} Prioritize quality over speed, then continue.${validationMarker}`,
        );
        return;
      }

      json(res, 400, { error: `unknown model: ${model}` });
      return;
    }

    json(res, 404, { error: `unknown path: ${req.url}` });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock server listening on ${port}`);
});
