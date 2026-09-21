import { randomUUID } from "node:crypto";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";
import {
  getMarkdownTheme,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Text } from "@earendil-works/pi-tui";
import { loadConfig, saveConfig, type AntiSlopConfig, type AntiSlopMode } from "./config.js";
import { formatLastAssessment, type LastAssessment } from "./diagnostics.js";
import {
  buildHumanizerRewriteSystemPrompt,
  decideHumanizer,
  extractHumanizerFinal,
  type HumanizerAssessment,
} from "./humanizer.js";
import { assessHumanizerPatterns } from "./jev.js";
import { formatRewriteModelRef, parseRewriteModelRef } from "./model-ref.js";
import { shouldProcessAssistant } from "./policy.js";
import { protectLiterals, restoreLiterals, type ProtectedText } from "./protect.js";

const ORIGINAL_ENTRY = "anti-slop-original";

interface OriginalEntryData {
  original: string;
  rewriteModel: string;
  issues: Array<{
    number: number;
    title: string;
    probability: number;
    weakAlone: boolean;
  }>;
  timestamp: number;
}

function assistantText(message: AssistantMessage): string {
  return message.content
    .filter(
      (part): part is Extract<AssistantMessage["content"][number], { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n\n")
    .trim();
}

function userText(message: UserMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n\n")
    .trim();
}

interface PreparedTextBlocks {
  protectedText: ProtectedText;
  markers: string[];
  blockCount: number;
}

function prepareTextBlocks(message: AssistantMessage): PreparedTextBlocks {
  const blocks = message.content
    .filter(
      (part): part is Extract<AssistantMessage["content"][number], { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text);

  const original = blocks.join("\n");
  let markerPrefix = "__PI_ANTI_SLOP_BLOCK_BREAK_";
  while (original.includes(markerPrefix)) markerPrefix += "X_";

  const markers = Array.from(
    { length: Math.max(0, blocks.length - 1) },
    (_, index) => `${markerPrefix}${index}__`,
  );

  const marked = blocks
    .map((block, index) => (index === 0 ? block : `${markers[index - 1]}\n${block}`))
    .join("\n");

  return {
    protectedText: protectLiterals(marked),
    markers,
    blockCount: blocks.length,
  };
}

function restoreTextBlocks(rewrittenProtected: string, prepared: PreparedTextBlocks): string[] {
  let rest = restoreLiterals(rewrittenProtected, prepared.protectedText);
  const blocks: string[] = [];

  for (const marker of prepared.markers) {
    const first = rest.indexOf(marker);
    const last = rest.lastIndexOf(marker);
    if (first < 0 || first !== last) {
      throw new Error(`Text block marker was changed or duplicated: ${marker}`);
    }
    blocks.push(rest.slice(0, first).trim());
    rest = rest.slice(first + marker.length);
  }

  blocks.push(rest.trim());
  if (blocks.length !== prepared.blockCount) {
    throw new Error("Rewritten text block count changed");
  }
  return blocks;
}

export function replaceAssistantTextBlocks(
  message: AssistantMessage,
  blocks: string[],
): AssistantMessage {
  const content: AssistantMessage["content"] = [];
  let textIndex = 0;

  for (const part of message.content) {
    if (part.type !== "text") {
      content.push(part);
      continue;
    }

    const text = blocks[textIndex++];
    if (text === undefined) throw new Error("Missing rewritten text block");
    content.push({ ...part, text });
  }

  if (textIndex !== blocks.length) {
    throw new Error("Unexpected rewritten text block");
  }

  return { ...message, content };
}

function buildRewritePrompt(userRequest: string, protectedResponse: string): string {
  return [
    "<conversation_context>",
    "The latest user request is context for preserving intent and voice. Do not answer it as a new task:",
    userRequest,
    "</conversation_context>",
    "",
    "<assistant_response_to_humanize>",
    protectedResponse,
    "</assistant_response_to_humanize>",
  ].join("\n");
}

async function rewriteWithConfiguredModel(
  ctx: ExtensionContext,
  modelRef: string,
  userRequest: string,
  message: AssistantMessage,
): Promise<{ text: string; blocks: string[] }> {
  const parsed = parseRewriteModelRef(
    modelRef,
    (provider, modelId) => ctx.modelRegistry.find(provider, modelId),
  );
  if (!parsed) throw new Error(`Invalid or unavailable rewrite model: ${modelRef}`);

  const model = ctx.modelRegistry.find(parsed.provider, parsed.modelId);
  if (!model) throw new Error(`Rewrite model is unavailable: ${modelRef}`);

  const prepared = prepareTextBlocks(message);
  const nonce = randomUUID().replaceAll("-", "");
  const startMarker = `<<<PI_ANTI_SLOP_FINAL:${nonce}>>>`;
  const endMarker = `<<<PI_ANTI_SLOP_END:${nonce}>>>`;

  const stream = ctx.modelRegistry.streamSimple(
    model,
    {
      systemPrompt: buildHumanizerRewriteSystemPrompt(startMarker, endMarker),
      messages: [
        {
          role: "user",
          content: buildRewritePrompt(userRequest, prepared.protectedText.text),
          timestamp: Date.now(),
        },
      ],
    },
    {
      signal: ctx.signal,
      temperature: 0.15,
      reasoning: parsed.thinkingLevel === "off" ? undefined : parsed.thinkingLevel,
    },
  );

  const result = await stream.result();
  if (result.stopReason !== "stop") {
    const details = [
      result.errorMessage,
      result.rawStopReason ? `rawStopReason=${result.rawStopReason}` : undefined,
      result.responseModel ? `responseModel=${result.responseModel}` : undefined,
      result.providerThinkingLevel
        ? `providerThinkingLevel=${result.providerThinkingLevel}`
        : undefined,
      result.diagnostics?.length
        ? `diagnostics=${JSON.stringify(result.diagnostics)}`
        : undefined,
    ].filter(Boolean).join(" · ");

    throw new Error(
      `Rewrite model ${model.provider}/${model.id} stopped with ${result.stopReason}${details ? `: ${details}` : ""}`,
    );
  }

  const raw = assistantText(result);
  if (!raw) throw new Error("Rewrite model returned no text");

  const rewrittenProtected = extractHumanizerFinal(raw, startMarker, endMarker);
  const blocks = restoreTextBlocks(rewrittenProtected, prepared);

  return {
    text: blocks.join("\n\n").trim(),
    blocks,
  };
}

function statusText(config: AntiSlopConfig, originalsVisible: boolean): string {
  if (config.mode === "off") return "anti-slop: off";
  if (!config.rewriteModel) return `anti-slop: ${config.mode} · needs model`;
  return `anti-slop: ${config.mode}${originalsVisible ? " · originals shown" : ""}`;
}

function updateStatus(
  ctx: Pick<ExtensionContext, "ui">,
  config: AntiSlopConfig,
  originalsVisible: boolean,
): void {
  ctx.ui.setStatus("anti-slop", statusText(config, originalsVisible));
}

function getJevApiKey(): string | undefined {
  return process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY;
}

function getJevEndpoint(): string | undefined {
  return process.env.JEV_ENDPOINT || undefined;
}

function explainConfig(config: AntiSlopConfig): string {
  return [
    `mode=${config.mode}`,
    `rewriteModel=${config.rewriteModel ?? "(not set)"}`,
    `jevModel=${config.jevModel}`,
    "policy=Humanizer 3.0.0 (Noul > 0.5; weak-alone needs company)",
    `shortcut=${config.shortcut}`,
  ].join(" · ");
}

async function chooseRewriteModel(
  ctx: ExtensionCommandContext,
): Promise<string | undefined> {
  const refs = ctx.scopedModels.length
    ? ctx.scopedModels.map((entry) =>
        formatRewriteModelRef({
          provider: entry.model.provider,
          modelId: entry.model.id,
          thinkingLevel: entry.thinkingLevel,
        }),
      )
    : ctx.modelRegistry.getAvailable().map((model) => `${model.provider}/${model.id}`);

  const uniqueRefs = [...new Set(refs)].sort();
  if (uniqueRefs.length === 0) {
    ctx.ui.notify("No configured models are available.", "error");
    return undefined;
  }

  return ctx.ui.select("Anti-slop rewrite model", uniqueRefs);
}

function issueData(assessment: HumanizerAssessment): OriginalEntryData["issues"] {
  return assessment.scores
    .filter((score) => score.present)
    .map((score) => ({
      number: score.pattern.number,
      title: score.pattern.title,
      probability: score.probability,
      weakAlone: score.pattern.weakAlone,
    }));
}

export default function antiSlop(pi: ExtensionAPI): void {
  let config = loadConfig();
  let lastUserRequest = "";
  let originalsVisible = false;
  let lastError = "";
  let lastAssessment: LastAssessment | undefined;
  let pendingOriginalEntry: OriginalEntryData | undefined;

  const persist = () => saveConfig(config);

  const reportError = (ctx: ExtensionContext, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    updateStatus(ctx, config, originalsVisible);
    if (message !== lastError) {
      lastError = message;
      ctx.ui.notify(`anti-slop: ${message}; using original response`, "warning");
    }
  };

  pi.registerEntryRenderer<OriginalEntryData>(ORIGINAL_ENTRY, (entry, _options, theme) => {
    const data = entry.data;
    if (!data) return undefined;

    return {
      render(width: number): string[] {
        if (!originalsVisible) {
          return [
            theme.fg(
              "dim",
              `↳ original response hidden · ${config.shortcut} to show`,
            ),
          ];
        }

        const issues = data.issues.length
          ? data.issues
              .slice(0, 5)
              .map(
                (issue) =>
                  `§${issue.number} ${issue.title} ${issue.probability.toFixed(2)}${issue.weakAlone ? " weak" : ""}`,
              )
              .join(", ")
          : "Humanizer";

        const container = new Container();
        container.addChild(
          new Text(
            `${theme.fg("accent", "[anti-slop original]")} ${theme.fg("dim", `(${issues})`)}`,
            1,
            0,
          ),
        );
        container.addChild(new Markdown(data.original, 1, 0, getMarkdownTheme()));
        return container.render(width);
      },
      invalidate(): void {},
    };
  });

  pi.registerShortcut(config.shortcut as Parameters<ExtensionAPI["registerShortcut"]>[0], {
    description: "Toggle original responses hidden by anti-slop",
    handler: (ctx) => {
      originalsVisible = !originalsVisible;
      updateStatus(ctx, config, originalsVisible);
    },
  });

  pi.registerCommand("anti-slop", {
    description: "Configure Jev + Humanizer assistant-output rewriting",
    handler: async (rawArgs, ctx) => {
      const args = rawArgs.trim().split(/\s+/).filter(Boolean);
      const command = args[0]?.toLowerCase() ?? "status";

      if (command === "status") {
        ctx.ui.notify(explainConfig(config), "info");
        return;
      }

      if (command === "last") {
        ctx.ui.notify(formatLastAssessment(lastAssessment), "info");
        return;
      }

      if (command === "mode") {
        const mode = args[1]?.toLowerCase() as AntiSlopMode | undefined;
        if (mode !== "off" && mode !== "final" && mode !== "all") {
          ctx.ui.notify("Mode must be one of: off, final, all.", "error");
          return;
        }
        config = { ...config, mode };
        persist();
        updateStatus(ctx, config, originalsVisible);
        ctx.ui.notify(`anti-slop mode: ${mode}`, "info");
        return;
      }

      if (command === "on" || command === "off") {
        const mode: AntiSlopMode = command === "on" ? "final" : "off";
        config = { ...config, mode };
        persist();
        updateStatus(ctx, config, originalsVisible);
        ctx.ui.notify(`anti-slop mode: ${mode}`, "info");
        return;
      }

      if (command === "model") {
        let ref = args.slice(1).join(" ").trim();
        if (!ref) {
          ref = (await chooseRewriteModel(ctx)) ?? "";
          if (!ref) return;
        }

        const parsed = parseRewriteModelRef(
          ref,
          (provider, modelId) => ctx.modelRegistry.find(provider, modelId),
        );
        if (!parsed) {
          ctx.ui.notify(`Model not found or invalid thinking level: ${ref}`, "error");
          return;
        }

        ref = formatRewriteModelRef(parsed);
        config = { ...config, rewriteModel: ref };
        persist();
        updateStatus(ctx, config, originalsVisible);
        ctx.ui.notify(`Rewrite model: ${ref}`, "info");
        return;
      }

      if (command === "threshold" || command === "validation-threshold") {
        ctx.ui.notify(
          "This setting was removed. Humanizer 3.0.0 now controls the gate: Noul > 0.5 marks a tell, and weak-alone tells need company.",
          "info",
        );
        return;
      }

      ctx.ui.notify(
        "Usage: /anti-slop [status|last|mode off|final|all|on|off|model [provider/model[:thinking]]]",
        "info",
      );
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    config = loadConfig();
    lastAssessment = undefined;
    updateStatus(ctx, config, originalsVisible);
  });

  pi.on("turn_end", async () => {
    if (!pendingOriginalEntry) return;
    pi.appendEntry<OriginalEntryData>(ORIGINAL_ENTRY, pendingOriginalEntry);
    pendingOriginalEntry = undefined;
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role === "user") {
      lastUserRequest = userText(event.message);
      return;
    }

    if (event.message.role !== "assistant") return;
    if (!config.rewriteModel) return;
    if (!shouldProcessAssistant(event.message, config.mode)) return;

    const original = assistantText(event.message);
    const apiKey = getJevApiKey();

    if (!apiKey) {
      const error = "TYPESAFE_API_KEY is not configured";
      lastAssessment = {
        timestamp: Date.now(),
        mode: config.mode,
        stopReason: event.message.stopReason,
        rewriteModel: config.rewriteModel,
        result: "error",
        error,
      };
      reportError(ctx, new Error(error));
      return;
    }

    const jevOptions = {
      apiKey,
      endpoint: getJevEndpoint(),
      model: config.jevModel,
      signal: ctx.signal,
    };

    let assessment: HumanizerAssessment | undefined;
    let stage: "checking" | "rewriting" = "checking";

    try {
      ctx.ui.setStatus("anti-slop", "anti-slop: checking");
      assessment = await assessHumanizerPatterns(lastUserRequest, original, jevOptions);
      const decision = decideHumanizer(assessment);

      if (!decision.rewrite) {
        lastAssessment = {
          timestamp: Date.now(),
          mode: config.mode,
          stopReason: event.message.stopReason,
          rewriteModel: config.rewriteModel,
          result: "kept",
          assessment,
          decision,
        };
        lastError = "";
        return;
      }

      stage = "rewriting";
      ctx.ui.setStatus("anti-slop", "anti-slop: humanizing");
      const rewrite = await rewriteWithConfiguredModel(
        ctx,
        config.rewriteModel,
        lastUserRequest,
        event.message,
      );

      if (!rewrite.text || rewrite.text === original) {
        lastAssessment = {
          timestamp: Date.now(),
          mode: config.mode,
          stopReason: event.message.stopReason,
          rewriteModel: config.rewriteModel,
          result: "unchanged",
          assessment,
          decision,
        };
        lastError = "";
        return;
      }

      pendingOriginalEntry = {
        original,
        rewriteModel: config.rewriteModel,
        issues: issueData(assessment),
        timestamp: Date.now(),
      };

      lastAssessment = {
        timestamp: Date.now(),
        mode: config.mode,
        stopReason: event.message.stopReason,
        rewriteModel: config.rewriteModel,
        result: "rewritten",
        assessment,
        decision,
      };

      lastError = "";
      return {
        message: replaceAssistantTextBlocks(event.message, rewrite.blocks),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastAssessment = {
        timestamp: Date.now(),
        mode: config.mode,
        stopReason: event.message.stopReason,
        rewriteModel: config.rewriteModel,
        result: stage === "rewriting" ? "fallback" : "error",
        assessment,
        decision: assessment ? decideHumanizer(assessment) : undefined,
        error: message,
      };
      reportError(ctx, error);
      return;
    } finally {
      updateStatus(ctx, config, originalsVisible);
    }
  });
}
