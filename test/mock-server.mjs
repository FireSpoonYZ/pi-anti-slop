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
  const request = String(body?.state?.user_request ?? "");
  const noRewrite = request.includes("[NO_REWRITE]");
  const weakOne = request.includes("[WEAK_ONE]");
  const weakTwo = request.includes("[WEAK_TWO]");

  for (const key of Object.keys(body?.questions ?? {})) {
    let p = 0.08;
    if (!noRewrite && !weakOne && !weakTwo && key === "pattern_01_not_x_but_y") p = 0.98;
    if (weakOne && key === "pattern_08_dashes_as_the_universal_connector") p = 0.21;
    if (weakTwo && key === "pattern_08_dashes_as_the_universal_connector") p = 0.91;
    if (weakTwo && key === "pattern_09_stacked_qualifiers") p = 0.87;
    answers[key] = { noul: p };
  }

  return { answers };
}

function messageText(message) {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .filter((part) => part && (part.type === "text" || part.type === "input_text"))
      .map((part) => String(part.text ?? ""))
      .join("\n");
  }
  return "";
}

function extractLastUserMessage(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find((m) => m?.role === "user");
  return messageText(lastUser);
}

function extractLiteralTokens(text) {
  return [...text.matchAll(/__PI_ANTI_SLOP_LITERAL_\d+__/g)].map((m) => m[0]);
}

function extractSystemText(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const system = messages.find((message) => message?.role === "system" || message?.role === "developer");
  if (!system) return "";
  if (typeof system.content === "string") return system.content;
  if (Array.isArray(system.content)) {
    return system.content
      .filter((part) => part && (part.type === "text" || part.type === "input_text"))
      .map((part) => String(part.text ?? ""))
      .join("\n");
  }
  return "";
}

function extractFinalMarkers(body) {
  const system = extractSystemText(body);
  const start = system.match(/<<<PI_ANTI_SLOP_FINAL:[a-f0-9]+>>>/)?.[0];
  const end = system.match(/<<<PI_ANTI_SLOP_END:[a-f0-9]+>>>/)?.[0];
  if (!start || !end) throw new Error("rewrite request did not include final markers");
  return { start, end };
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
        const messages = Array.isArray(body?.messages) ? body.messages : [];
        const hasToolResult = messages.some((message) => message?.role === "tool");

        if (prompt.includes("[HISTORY_CHECK]")) {
          const priorAssistant = messages
            .filter((message) => message?.role === "assistant")
            .map(messageText)
            .join("\n");
          const ok = priorAssistant.includes("Improve the wording without changing the substance.")
            && !priorAssistant.includes("**Core Execution Pipeline:**");
          streamChat(res, model, ok ? "history-ok" : "history-bad");
          return;
        }

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
        const { start, end } = extractFinalMarkers(body);

        if (prompt.includes("[BAD_MARKER]")) {
          streamChat(res, model, "final text without integration markers");
          return;
        }

        streamChat(
          res,
          model,
          `${start}\nImprove the wording without changing the substance.${literalClause} Prioritize quality over speed, then continue.\n${end}`,
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
