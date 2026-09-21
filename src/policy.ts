import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { AntiSlopMode } from "./config.js";

const ALL_REWRITABLE_STOP_REASONS = new Set<AssistantMessage["stopReason"]>([
  "stop",
  "toolUse",
  "length",
]);

export function shouldProcessAssistant(
  message: AssistantMessage,
  mode: AntiSlopMode,
): boolean {
  if (mode === "off") return false;
  if (!message.content.some((part) => part.type === "text" && part.text.trim().length > 0)) {
    return false;
  }
  if (mode === "final") return message.stopReason === "stop";
  return ALL_REWRITABLE_STOP_REASONS.has(message.stopReason);
}
