# pi-anti-slop

A Pi extension that uses Jev to detect conspicuous AI-writing mannerisms in assistant output and, when needed, rewrites the prose with a user-selected Pi model.

## Processing modes

The extension has three modes:

- `off` — do nothing.
- `final` — process only normal final assistant responses (`stopReason === "stop"`). Intermediate tool-calling turns are untouched. This is the default.
- `all` — process every completed assistant turn that contains text, including `stop`, `toolUse`, and `length` turns. Error, aborted, deferred, and pending messages are skipped.

In `all` mode, tool calls themselves are never rewritten. Text blocks are rewritten in place while tool-call content and ordering are preserved.

## How it works

1. Hooks Pi's `message_end` event and applies the configured processing mode.
2. Sends the user request and assistant text to Jev in one System One request with parallel style checks.
3. If `should_rewrite` is above the configured threshold, rewrites the response with a user-selected Pi model.
4. Hard-protects fenced code, inline code, URLs, and assistant text-block boundaries with placeholders/markers during rewriting.
5. Runs a second Jev check for meaning preservation, no new facts, and technical-literal preservation.
6. If validation passes, replaces only the assistant text blocks. If anything fails, the original response is kept.
7. Stores the source response as a TUI-only custom session entry after the rewritten turn. It is not sent back to the model.

## Style checks

The current Jev pass checks for:

- invented or gratuitously branded jargon
- telegraphic noun stacking
- choppy fragments
- unnecessary headings
- unnecessary listification
- canned contrast phrasing
- repetitive summaries
- meta-preambles
- formatting overuse
- sycophantic filler
- abstract-noun overload
- canned assistant closings
- an overall generic AI-writing register

All questions are sent in one Jev request.

## Setup

Install from GitHub:

```bash
pi install https://github.com/FireSpoonYZ/pi-anti-slop
```

Set a TypeSafe/Jev API key in the environment before starting Pi:

```bash
export TYPESAFE_API_KEY="..."
pi
```

For a persistent shell setting:

```bash
echo 'export TYPESAFE_API_KEY="..."' >> ~/.bashrc
source ~/.bashrc
```

`JEV_API_KEY` is accepted as a fallback alias.

Choose the model that should perform rewrites:

```text
/anti-slop model
```

Passing a model explicitly also works:

```text
/anti-slop model anthropic/claude-sonnet-4-5
```

You can append a Pi thinking level to the model reference:

```text
/anti-slop model openai/gpt-model:high
/anti-slop model anthropic/claude-model:medium
/anti-slop model provider/model:off
```

Supported suffixes are `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`. Pi/provider model capability handling still applies. A model ID that itself contains a colon (for example an Ollama-style `model:tag`) is matched as a full model ID before interpreting a final colon suffix as a thinking level.

The rewrite model is resolved through Pi's own model registry, so built-in providers, `models.json` providers, and extension-registered providers are all usable as long as they are configured/authenticated in Pi.

Configuration is stored in `~/.pi/agent/anti-slop.json` by default. The default mode is `final`.

## Commands

```text
/anti-slop status
/anti-slop last
/anti-slop mode off
/anti-slop mode final
/anti-slop mode all
/anti-slop model [provider/model[:thinking]]
/anti-slop threshold 0.72
/anti-slop validation-threshold 0.84
```

For compatibility, `/anti-slop on` is an alias for `mode final`, and `/anti-slop off` is an alias for `mode off`.

The default rewrite threshold is `0.72`; the default post-rewrite validation threshold is `0.84`.

`/anti-slop last` shows the most recent Jev decision in the current session, including `should_rewrite`, all style probabilities, the thresholds, rewrite model, final result, validation probabilities when applicable, and any fallback/error reason. It also records below-threshold decisions, so you can distinguish “Jev ran and chose not to rewrite” from “the hook did not run”.

Press `Ctrl+Alt+O` to toggle the original responses hidden by the extension. The original response is rendered as Markdown when expanded.

Legacy configs containing `"enabled": true` migrate to `mode: "final"`; `"enabled": false` migrates to `mode: "off"`.

## Environment variables

- `TYPESAFE_API_KEY` — Jev API key.
- `JEV_API_KEY` — fallback alias for the Jev API key.
- `JEV_ENDPOINT` — override the System One endpoint, mainly useful for testing.
- `PI_ANTI_SLOP_CONFIG` — override the config path.

## Testing

The test environment is deliberately isolated from the host Pi installation.

```bash
docker build -t pi-anti-slop:test .
docker run --rm pi-anti-slop:test
```

The Docker suite performs TypeScript checking, unit tests, and a Pi 0.86.1 end-to-end test against local mock Jev and OpenAI-compatible endpoints. The integration test covers:

- `final` mode rewriting only the final `stop` turn
- `all` mode rewriting both an intermediate `toolUse` turn and the final `stop` turn
- tool-call preservation while intermediate text is rewritten
- rewrite-model thinking suffix propagation to the provider request
- protected inline code preservation
- below-threshold no-rewrite path
- failed post-rewrite validation falling back to the original
- persisted session ordering: rewritten assistant response first, hidden original entry second
- real PTY playback of `Ctrl+Alt+O`, verifying the hidden original expands in Pi's TUI
- real TUI execution of `/anti-slop last`, verifying the latest Jev decision and validation metrics are visible

## Notes

The primary model's original text may still be visible while it is streaming. The extension makes its decision at `message_end`, when Pi has a completed assistant message for that turn. In `final` mode only normal final responses are processed; in `all` mode completed intermediate turns are processed as well.
