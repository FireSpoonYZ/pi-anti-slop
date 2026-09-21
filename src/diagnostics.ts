import type { StyleAssessment, ValidationAssessment } from "./jev.js";

export type LastResult =
  | "not-rewritten"
  | "unchanged"
  | "rewritten"
  | "validation-fallback"
  | "error";

export interface LastAssessment {
  timestamp: number;
  mode: string;
  stopReason: string;
  rewriteModel?: string;
  rewriteThreshold: number;
  validationThreshold: number;
  result: LastResult;
  style?: StyleAssessment;
  validation?: ValidationAssessment;
  error?: string;
}

function formatProbability(value: number | undefined): string {
  return value === undefined ? "-" : value.toFixed(3);
}

export function formatLastAssessment(last: LastAssessment | undefined): string {
  if (!last) return "anti-slop: no Jev assessment has run in this session yet.";

  const lines = [
    `anti-slop last · result=${last.result}`,
    `mode=${last.mode} · stopReason=${last.stopReason}`,
    `model=${last.rewriteModel ?? "(not set)"}`,
  ];

  if (last.style) {
    lines.push(
      `should_rewrite=${formatProbability(last.style.shouldRewrite)} · threshold=${last.rewriteThreshold.toFixed(3)}`,
      "",
      "Style:",
    );

    const styleEntries = Object.entries(last.style.probabilities)
      .filter(([id]) => id !== "should_rewrite")
      .sort((a, b) => b[1] - a[1]);

    for (const [id, probability] of styleEntries) {
      lines.push(`  ${id.padEnd(28)} ${formatProbability(probability)}`);
    }
  }

  if (last.validation) {
    lines.push(
      "",
      `Validation · threshold=${last.validationThreshold.toFixed(3)}:`,
      `  meaning_preserved            ${formatProbability(last.validation.meaningPreserved)}`,
      `  no_new_facts                 ${formatProbability(last.validation.noNewFacts)}`,
      `  technical_literals_preserved ${formatProbability(last.validation.technicalLiteralsPreserved)}`,
    );
  }

  if (last.error) {
    lines.push("", `error=${last.error}`);
  }

  return lines.join("\n");
}
