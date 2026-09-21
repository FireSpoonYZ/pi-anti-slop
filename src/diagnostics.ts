import {
  HUMANIZER_COMMIT,
  HUMANIZER_VERSION,
  NOUL_TRUE_THRESHOLD,
  type HumanizerAssessment,
  type HumanizerDecision,
} from "./humanizer.js";

export type LastResult =
  | "kept"
  | "unchanged"
  | "rewritten"
  | "fallback"
  | "error";

export interface LastAssessment {
  timestamp: number;
  mode: string;
  stopReason: string;
  rewriteModel?: string;
  result: LastResult;
  assessment?: HumanizerAssessment;
  decision?: HumanizerDecision;
  error?: string;
}

function formatProbability(value: number): string {
  return value.toFixed(3);
}

export function formatLastAssessment(last: LastAssessment | undefined): string {
  if (!last) return "anti-slop: no Jev assessment has run in this session yet.";

  const lines = [
    `anti-slop last · result=${last.result}`,
    `Humanizer=${HUMANIZER_VERSION}@${HUMANIZER_COMMIT.slice(0, 7)} · Noul true > ${NOUL_TRUE_THRESHOLD.toFixed(2)}`,
    `mode=${last.mode} · stopReason=${last.stopReason}`,
    `model=${last.rewriteModel ?? "(not set)"}`,
  ];

  if (last.decision) {
    lines.push(
      `decision=${last.decision.rewrite ? "REWRITE" : "KEEP"}`,
      `reason=${last.decision.reason}`,
    );
  }

  if (last.assessment) {
    lines.push("", "Humanizer patterns:");
    for (const score of last.assessment.scores) {
      const flags = [
        score.present ? "HIT" : "",
        score.pattern.oneSighting ? "ONE-SIGHTING" : "",
        score.pattern.weakAlone ? "WEAK-ALONE" : "",
      ].filter(Boolean).join(" ");
      lines.push(
        `  §${String(score.pattern.number).padStart(2, "0")} ${score.pattern.title.padEnd(38)} ${formatProbability(score.probability)}${flags ? `  ${flags}` : ""}`,
      );
    }
  }

  if (last.error) lines.push("", `error=${last.error}`);
  return lines.join("\n");
}
