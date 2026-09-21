import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export type AntiSlopMode = "off" | "final" | "all";

export interface AntiSlopConfig {
  mode: AntiSlopMode;
  rewriteModel?: string;
  rewriteThreshold: number;
  validationThreshold: number;
  jevModel: string;
  shortcut: string;
}

export const DEFAULT_CONFIG: AntiSlopConfig = {
  mode: "final",
  rewriteThreshold: 0.72,
  validationThreshold: 0.84,
  jevModel: "jev-latest",
  shortcut: "ctrl+alt+o",
};

export function getConfigPath(): string {
  return process.env.PI_ANTI_SLOP_CONFIG ?? join(getAgentDir(), "anti-slop.json");
}

function clampProbability(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function parseMode(raw: Record<string, unknown>): AntiSlopMode {
  if (raw.mode === "off" || raw.mode === "final" || raw.mode === "all") {
    return raw.mode;
  }

  // Backward compatibility with the initial config format.
  if (typeof raw.enabled === "boolean") {
    return raw.enabled ? "final" : "off";
  }

  return DEFAULT_CONFIG.mode;
}

export function loadConfig(): AntiSlopConfig {
  const path = getConfigPath();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    return {
      mode: parseMode(raw),
      rewriteModel: typeof raw.rewriteModel === "string" && raw.rewriteModel.trim()
        ? raw.rewriteModel.trim()
        : undefined,
      rewriteThreshold: clampProbability(raw.rewriteThreshold, DEFAULT_CONFIG.rewriteThreshold),
      validationThreshold: clampProbability(raw.validationThreshold, DEFAULT_CONFIG.validationThreshold),
      jevModel: typeof raw.jevModel === "string" && raw.jevModel.trim()
        ? raw.jevModel.trim()
        : DEFAULT_CONFIG.jevModel,
      shortcut: typeof raw.shortcut === "string" && raw.shortcut.trim()
        ? raw.shortcut.trim()
        : DEFAULT_CONFIG.shortcut,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: AntiSlopConfig): void {
  const path = getConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
}
