import type { Model } from "@earendil-works/pi-ai";

export const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type RewriteThinkingLevel = typeof THINKING_LEVELS[number];

export interface ParsedRewriteModelRef {
  provider: string;
  modelId: string;
  thinkingLevel?: RewriteThinkingLevel;
}

function splitProviderModel(ref: string): { provider: string; modelId: string } | undefined {
  const slash = ref.indexOf("/");
  if (slash <= 0 || slash === ref.length - 1) return undefined;
  return { provider: ref.slice(0, slash), modelId: ref.slice(slash + 1) };
}

export function parseRewriteModelRef(
  ref: string,
  findModel: (provider: string, modelId: string) => Model<any> | undefined,
): ParsedRewriteModelRef | undefined {
  const exact = splitProviderModel(ref);
  if (exact && findModel(exact.provider, exact.modelId)) {
    return exact;
  }

  const colon = ref.lastIndexOf(":");
  if (colon <= 0 || colon === ref.length - 1) return undefined;

  const suffix = ref.slice(colon + 1) as RewriteThinkingLevel;
  if (!THINKING_LEVELS.includes(suffix)) return undefined;

  const base = splitProviderModel(ref.slice(0, colon));
  if (!base || !findModel(base.provider, base.modelId)) return undefined;

  return { ...base, thinkingLevel: suffix };
}

export function formatRewriteModelRef(parsed: ParsedRewriteModelRef): string {
  const base = `${parsed.provider}/${parsed.modelId}`;
  return parsed.thinkingLevel ? `${base}:${parsed.thinkingLevel}` : base;
}
