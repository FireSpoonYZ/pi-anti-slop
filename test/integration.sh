#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

export PI_CODING_AGENT_DIR="$TMP/pi-agent"
export PI_CODING_AGENT_SESSION_DIR="$TMP/sessions"
export PI_ANTI_SLOP_CONFIG="$PI_CODING_AGENT_DIR/anti-slop.json"
export TYPESAFE_API_KEY="test-key"
export JEV_ENDPOINT="http://127.0.0.1:8787/v1/systemone"
export PI_OFFLINE=1

mkdir -p "$PI_CODING_AGENT_DIR" "$PI_CODING_AGENT_SESSION_DIR"

cat > "$PI_CODING_AGENT_DIR/models.json" <<'JSON'
{
  "providers": {
    "mock": {
      "baseUrl": "http://127.0.0.1:8787/v1",
      "api": "openai-completions",
      "apiKey": "mock-key",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": true
      },
      "models": [
        {
          "id": "main",
          "name": "Mock Main",
          "reasoning": false,
          "input": ["text"],
          "contextWindow": 32000,
          "maxTokens": 4096,
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
        },
        {
          "id": "rewrite",
          "name": "Mock Rewrite",
          "reasoning": true,
          "thinkingLevelMap": {"off":"none","minimal":"minimal","low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":"max"},
          "input": ["text"],
          "contextWindow": 32000,
          "maxTokens": 4096,
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
        }
      ]
    }
  }
}
JSON

cat > "$PI_ANTI_SLOP_CONFIG" <<'JSON'
{
  "mode": "final",
  "rewriteModel": "mock/rewrite:high",
  "rewriteThreshold": 0.72,
  "validationThreshold": 0.84,
  "jevModel": "jev-latest",
  "shortcut": "ctrl+alt+o"
}
JSON

node "$ROOT/test/mock-server.mjs" > "$TMP/mock.log" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 50); do
  if node -e "fetch('http://127.0.0.1:8787/nope').then(()=>process.exit(0)).catch(()=>process.exit(1))"; then
    break
  fi
  sleep 0.05
done

set_mode() {
  node - "$PI_ANTI_SLOP_CONFIG" "$1" <<'NODE'
import fs from "node:fs";
const [path, mode] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(path, "utf8"));
config.mode = mode;
delete config.enabled;
fs.writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
NODE
}

run_pi() {
  "$ROOT/node_modules/.bin/pi" \
    --offline \
    --no-context-files \
    --no-skills \
    --no-prompt-templates \
    --no-themes \
    --no-extensions \
    --extension "$ROOT/src/index.ts" \
    --provider mock \
    --model main \
    --no-tools \
    --session-dir "$PI_CODING_AGENT_SESSION_DIR" \
    -p \
    "$1" 2>&1
}

run_pi_with_read() {
  "$ROOT/node_modules/.bin/pi" \
    --offline \
    --no-context-files \
    --no-skills \
    --no-prompt-templates \
    --no-themes \
    --no-extensions \
    --extension "$ROOT/src/index.ts" \
    --provider mock \
    --model main \
    --tools read \
    --session-dir "$PI_CODING_AGENT_SESSION_DIR" \
    -p \
    "$1" 2>&1
}

set +e
OUTPUT="$(run_pi "Explain the recommended execution approach.")"
STATUS=$?
set -e

if [[ $STATUS -ne 0 ]]; then
  printf '%s\n' "$OUTPUT"
  printf '%s\n' "---- mock log ----"
  cat "$TMP/mock.log"
  exit $STATUS
fi

printf '%s\n' "$OUTPUT"

grep -Fq 'Improve the wording without changing the substance.' <<<"$OUTPUT"
grep -Fq '`cargo test`' <<<"$OUTPUT"
grep -Fq 'Prioritize quality over speed' <<<"$OUTPUT"
grep -Fq 'chat model=rewrite reasoning_effort=high' "$TMP/mock.log"

if grep -Fq '**Core Execution Pipeline:**' <<<"$OUTPUT"; then
  echo "integration failure: original AI-ish response leaked into final print output" >&2
  exit 1
fi

SESSION_FILE="$(find "$PI_CODING_AGENT_SESSION_DIR" -type f -name '*.jsonl' | head -n 1)"
if [[ -z "$SESSION_FILE" ]]; then
  echo "integration failure: Pi did not persist a session file" >&2
  exit 1
fi

node - "$SESSION_FILE" <<'NODE'
import fs from "node:fs";

const path = process.argv[2];
const entries = fs.readFileSync(path, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const assistantIndex = entries.findLastIndex(
  (entry) => entry.type === "message" && entry.message?.role === "assistant",
);
const originalIndex = entries.findLastIndex(
  (entry) => entry.type === "custom" && entry.customType === "anti-slop-original",
);

if (assistantIndex < 0 || originalIndex < 0) {
  throw new Error("missing rewritten assistant or anti-slop original entry");
}

const assistant = entries[assistantIndex];
const original = entries[originalIndex];

if (original.parentId !== assistant.id) {
  throw new Error(
    `original entry must follow rewritten assistant; parent=${original.parentId}, assistant=${assistant.id}`,
  );
}

const rewrittenText = assistant.message.content
  .filter((part) => part.type === "text")
  .map((part) => part.text)
  .join("\n");

if (!rewrittenText.includes("Improve the wording without changing the substance.")) {
  throw new Error("session did not persist the rewritten assistant text");
}

if (!original.data?.original?.includes("**Core Execution Pipeline:**")) {
  throw new Error("original entry did not preserve the source response");
}
NODE

REWRITE_COUNT_BEFORE="$(grep -c 'chat model=rewrite' "$TMP/mock.log" || true)"
NO_REWRITE_OUTPUT="$(run_pi "[NO_REWRITE] Explain the recommended execution approach.")"
REWRITE_COUNT_AFTER="$(grep -c 'chat model=rewrite' "$TMP/mock.log" || true)"

grep -Fq '**Core Execution Pipeline:**' <<<"$NO_REWRITE_OUTPUT"
if [[ "$REWRITE_COUNT_BEFORE" != "$REWRITE_COUNT_AFTER" ]]; then
  echo "integration failure: rewrite model was called below Jev threshold" >&2
  exit 1
fi

VALIDATION_FAIL_OUTPUT="$(run_pi "[VALIDATION_FAIL] Explain the recommended execution approach.")"
grep -Fq '**Core Execution Pipeline:**' <<<"$VALIDATION_FAIL_OUTPUT"
if grep -Fq 'Improve the wording without changing the substance.' <<<"$VALIDATION_FAIL_OUTPUT"; then
  echo "integration failure: failed rewrite validation did not fall back to original" >&2
  exit 1
fi

set_mode final
FINAL_TOOL_REWRITES_BEFORE="$(grep -c 'chat model=rewrite' "$TMP/mock.log" || true)"
run_pi_with_read "[TOOL_USE] Inspect the hostname and answer." >/dev/null
FINAL_TOOL_REWRITES_AFTER="$(grep -c 'chat model=rewrite' "$TMP/mock.log" || true)"
if (( FINAL_TOOL_REWRITES_AFTER - FINAL_TOOL_REWRITES_BEFORE != 1 )); then
  echo "integration failure: final mode should rewrite only the final stop turn" >&2
  exit 1
fi

set_mode all
ALL_TOOL_REWRITES_BEFORE="$(grep -c 'chat model=rewrite' "$TMP/mock.log" || true)"
run_pi_with_read "[TOOL_USE] Inspect the hostname and answer." >/dev/null
ALL_TOOL_REWRITES_AFTER="$(grep -c 'chat model=rewrite' "$TMP/mock.log" || true)"
if (( ALL_TOOL_REWRITES_AFTER - ALL_TOOL_REWRITES_BEFORE != 2 )); then
  echo "integration failure: all mode should rewrite both toolUse and final stop turns" >&2
  echo "rewrite-count-before=$ALL_TOOL_REWRITES_BEFORE after=$ALL_TOOL_REWRITES_AFTER" >&2
  echo "---- mock log ----" >&2
  tail -80 "$TMP/mock.log" >&2
  echo "---- latest session ----" >&2
  DEBUG_SESSION="$(find "$PI_CODING_AGENT_SESSION_DIR" -type f -name '*.jsonl' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
  cat "$DEBUG_SESSION" >&2 || true
  exit 1
fi

ALL_SESSION_FILE="$(find "$PI_CODING_AGENT_SESSION_DIR" -type f -name '*.jsonl' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
node - "$ALL_SESSION_FILE" <<'NODE'
import fs from "node:fs";

const path = process.argv[2];
const entries = fs.readFileSync(path, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const toolUse = entries.find(
  (entry) => entry.type === "message"
    && entry.message?.role === "assistant"
    && entry.message?.stopReason === "toolUse",
);
if (!toolUse) throw new Error("missing toolUse assistant turn");

const call = toolUse.message.content.find((part) => part.type === "toolCall");
if (!call || call.name !== "read") {
  throw new Error("all mode altered or removed the tool call");
}

const text = toolUse.message.content
  .filter((part) => part.type === "text")
  .map((part) => part.text)
  .join("\n");
if (!text.includes("Improve the wording without changing the substance.")) {
  throw new Error("all mode did not rewrite toolUse text");
}
NODE

set_mode final

TUI_CMD="$ROOT/node_modules/.bin/pi --offline --no-context-files --no-skills --no-prompt-templates --no-themes --no-extensions --extension $ROOT/src/index.ts --provider mock --model main --no-tools --session-dir $PI_CODING_AGENT_SESSION_DIR 'Explain the recommended execution approach.'"

set +e
{
  sleep 0.8
  printf '\033\017'
  sleep 0.4
  printf '\004'
} | TERM=xterm-256color timeout 4s script -qefc "$TUI_CMD" "$TMP/tui.log" >/dev/null 2>&1
set -e

grep -aFq 'original response hidden' "$TMP/tui.log"
grep -aFq '[anti-slop original]' "$TMP/tui.log"

echo "integration: final/all mode routing, rewrite, no-rewrite, validation fallback, tool-call preservation, session ordering, and TUI original toggle passed"
