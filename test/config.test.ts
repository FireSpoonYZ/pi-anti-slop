import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { loadConfig } from "../src/config.js";

function withConfig(value: unknown, fn: () => void): void {
  const dir = mkdtempSync(join(tmpdir(), "anti-slop-config-"));
  const path = join(dir, "config.json");
  const previous = process.env.PI_ANTI_SLOP_CONFIG;
  process.env.PI_ANTI_SLOP_CONFIG = path;
  try {
    writeFileSync(path, JSON.stringify(value), "utf8");
    fn();
  } finally {
    if (previous === undefined) delete process.env.PI_ANTI_SLOP_CONFIG;
    else process.env.PI_ANTI_SLOP_CONFIG = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("defaults to final mode", () => {
  const previous = process.env.PI_ANTI_SLOP_CONFIG;
  process.env.PI_ANTI_SLOP_CONFIG = join(tmpdir(), `does-not-exist-${process.pid}.json`);
  try {
    assert.equal(loadConfig().mode, "final");
  } finally {
    if (previous === undefined) delete process.env.PI_ANTI_SLOP_CONFIG;
    else process.env.PI_ANTI_SLOP_CONFIG = previous;
  }
});

test("accepts explicit off/final/all mode", () => {
  for (const mode of ["off", "final", "all"] as const) {
    withConfig({ mode }, () => assert.equal(loadConfig().mode, mode));
  }
});

test("migrates legacy enabled boolean to mode", () => {
  withConfig({ enabled: true }, () => assert.equal(loadConfig().mode, "final"));
  withConfig({ enabled: false }, () => assert.equal(loadConfig().mode, "off"));
});

test("explicit mode wins over legacy enabled", () => {
  withConfig({ mode: "all", enabled: false }, () => assert.equal(loadConfig().mode, "all"));
});
