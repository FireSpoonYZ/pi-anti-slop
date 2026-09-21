import assert from "node:assert/strict";
import test from "node:test";
import { protectLiterals, restoreLiterals } from "../src/protect.js";

test("protects fenced code, inline code, and URLs", () => {
  const original = [
    "Run `cargo test` first.",
    "",
    "```bash",
    "echo hello",
    "```",
    "",
    "See https://example.com/a?b=1.",
  ].join("\n");

  const protectedText = protectLiterals(original);
  assert.equal(protectedText.literals.length, 3);
  assert(!protectedText.text.includes("cargo test"));
  assert(!protectedText.text.includes("echo hello"));
  assert(!protectedText.text.includes("https://example.com"));

  const rewritten = `Please run ${protectedText.prefix}0__ first.\n\n${protectedText.prefix}1__\n\nSee ${protectedText.prefix}2__.`;
  const restored = restoreLiterals(rewritten, protectedText);

  assert(restored.includes("`cargo test`"));
  assert(restored.includes("```bash\necho hello\n```"));
  assert(restored.includes("https://example.com/a?b=1."));
});

test("rejects a missing protected placeholder", () => {
  const protectedText = protectLiterals("Use `rm -rf x` carefully.");
  assert.throws(
    () => restoreLiterals("Use something carefully.", protectedText),
    /changed or duplicated/,
  );
});

test("rejects duplicated protected placeholders", () => {
  const protectedText = protectLiterals("Use `cargo test`.");
  const token = `${protectedText.prefix}0__`;
  assert.throws(
    () => restoreLiterals(`${token} ${token}`, protectedText),
    /changed or duplicated/,
  );
});
