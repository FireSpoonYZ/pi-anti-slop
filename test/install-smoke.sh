#!/usr/bin/env bash
set -euo pipefail

PI_BIN=/app/node_modules/.bin/pi
PKG=/pkg
TMP="$(mktemp -d)"
PID=""
cleanup() {
  [[ -n "$PID" ]] && kill "$PID" 2>/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT

export PI_CODING_AGENT_DIR="$TMP/pi-agent"
export PI_CODING_AGENT_SESSION_DIR="$TMP/sessions"
export PI_ANTI_SLOP_CONFIG="$PI_CODING_AGENT_DIR/anti-slop.json"
export TYPESAFE_API_KEY=test-key
export JEV_ENDPOINT=http://127.0.0.1:8787/v1/systemone
export PI_OFFLINE=1
mkdir -p "$PI_CODING_AGENT_DIR" "$PI_CODING_AGENT_SESSION_DIR"

"$PI_BIN" install "$PKG"

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
          "reasoning": false,
          "input": ["text"],
          "contextWindow": 32000,
          "maxTokens": 4096,
          "cost": {"input":0,"output":0,"cacheRead":0,"cacheWrite":0}
        },
        {
          "id": "rewrite",
          "reasoning": true,
          "thinkingLevelMap": {
            "off":"none","minimal":"minimal","low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":"max"
          },
          "input": ["text"],
          "contextWindow": 32000,
          "maxTokens": 4096,
          "cost": {"input":0,"output":0,"cacheRead":0,"cacheWrite":0}
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
  "jevModel": "jev-latest",
  "shortcut": "ctrl+alt+o"
}
JSON

node "$PKG/test/mock-server.mjs" >"$TMP/mock.log" 2>&1 &
PID=$!

for _ in $(seq 1 50); do
  node -e "fetch('http://127.0.0.1:8787/nope').then(()=>process.exit(0)).catch(()=>process.exit(1))" && break
  sleep 0.05
done

OUT="$(
  "$PI_BIN"     --offline     --no-context-files     --no-skills     --no-prompt-templates     --no-themes     --provider mock     --model main     --no-tools     --no-session     -p     "Explain the recommended execution approach." 2>&1
)"

printf '%s
' "$OUT"
grep -Fq 'Improve the wording without changing the substance.' <<<"$OUT"
grep -Fq 'version: "3.0.0"' "$PKG/vendor/humanizer/SKILL.md"
echo "install-smoke: AUTOLOAD_HUMANIZER_OK"
