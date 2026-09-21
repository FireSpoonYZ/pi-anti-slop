export interface JevClientOptions {
  apiKey: string;
  endpoint?: string;
  model?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface StyleAssessment {
  shouldRewrite: number;
  probabilities: Record<string, number>;
  hits: Array<{ id: string; probability: number }>;
}

export interface ValidationAssessment {
  meaningPreserved: number;
  noNewFacts: number;
  technicalLiteralsPreserved: number;
}

export const STYLE_RULES: Record<string, string> = {
  coined_jargon:
    "Does the assistant invent, brand, capitalize, or relabel a term/framework for an ordinary idea when the user did not ask for naming or taxonomy? Do not count established domain terminology, identifiers, quoted names, or terms introduced by the user.",
  telegraphic_noun_stacking:
    "Does the prose repeatedly compress actions or relationships into chains of nouns, label-like fragments, or noun piles, creating a telegraphic unnatural style? Ignore legitimate technical identifiers, code, and concise headings.",
  fragment_choppiness:
    "Does the response overuse sentence fragments or very short clipped sentences in a way that reads mechanically rather than naturally?",
  gratuitous_headings:
    "Does the response use unnecessary headings or nested sectioning for material that would be clearer as ordinary prose or a short list?",
  gratuitous_listification:
    "Does the response turn simple prose into too many bullets, numbered steps, or rigid parallel items without a practical reason?",
  canned_contrast:
    "Does it overuse canned contrast templates such as 'not X, but Y', 'the key is', 'the core is', 'in essence', or equivalent formulaic phrasing?",
  repetitive_summary:
    "Does it restate the same conclusion or advice multiple times, including a redundant recap after the answer is already complete?",
  meta_preamble:
    "Does it include unnecessary meta-writing about how it will answer, what follows, or how the response is structured instead of answering directly?",
  formatting_overuse:
    "Does it overuse bold text, label-colon fragments, block emphasis, or decorative formatting in a way that makes the prose feel synthetic?",
  sycophantic_filler:
    "Does it add empty praise, approval, reassurance, or flattering filler that is not needed to answer the user's request?",
  abstract_noun_overload:
    "Does it rely too heavily on abstract nouns and nominalizations where concrete verbs and direct phrasing would be more natural?",
  canned_closing:
    "Does it end with a generic assistant-like offer or invitation that adds no value, such as offering more help when the user did not ask for alternatives?",
  overall_ai_register:
    "Taken as a whole, does the response have a conspicuously generic AI-assistant writing style that a human editor would likely rewrite even if no single issue is severe?",
};

type Question = {
  type: "noul";
  instructions: string;
};

function readNoul(answer: unknown): number {
  if (typeof answer === "number") return answer;
  if (!answer || typeof answer !== "object") return 0;
  const value = (answer as Record<string, unknown>).noul;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function systemOne(
  state: unknown,
  questions: Record<string, Question>,
  options: JevClientOptions,
): Promise<Record<string, unknown>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? "https://api.typesafe.ai/v1/systemone";

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: options.model ?? "jev-latest",
      state,
      questions,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Jev request failed: HTTP ${response.status}${body ? ` - ${body.slice(0, 300)}` : ""}`,
    );
  }

  const json = await response.json() as Record<string, unknown>;
  const answers = json.answers;
  if (!answers || typeof answers !== "object") {
    throw new Error("Jev response did not contain an answers object");
  }
  return answers as Record<string, unknown>;
}

export async function assessStyle(
  userRequest: string,
  assistantResponse: string,
  options: JevClientOptions,
): Promise<StyleAssessment> {
  const questions: Record<string, Question> = Object.fromEntries(
    Object.entries(STYLE_RULES).map(([id, instructions]) => [id, { type: "noul", instructions }]),
  );

  questions.should_rewrite = {
    type: "noul",
    instructions:
      "Should this assistant response be rewritten specifically to remove conspicuous AI-writing mannerisms while preserving its meaning, technical content, tone, and level of detail? Answer no when the response is already natural or when rewriting would mostly be stylistic churn.",
  };

  const answers = await systemOne(
    {
      user_request: userRequest,
      assistant_response: assistantResponse,
    },
    questions,
    options,
  );

  const probabilities: Record<string, number> = {};
  for (const id of Object.keys(questions)) {
    probabilities[id] = readNoul(answers[id]);
  }

  const hits = Object.entries(probabilities)
    .filter(([id, probability]) => id !== "should_rewrite" && probability >= 0.5)
    .map(([id, probability]) => ({ id, probability }))
    .sort((a, b) => b.probability - a.probability);

  return {
    shouldRewrite: probabilities.should_rewrite ?? 0,
    probabilities,
    hits,
  };
}

export async function validateRewrite(
  originalResponse: string,
  rewrittenResponse: string,
  options: JevClientOptions,
): Promise<ValidationAssessment> {
  const answers = await systemOne(
    {
      original_response: originalResponse,
      rewritten_response: rewrittenResponse,
    },
    {
      meaning_preserved: {
        type: "noul",
        instructions:
          "Does the rewritten response preserve the original response's substantive meaning, conclusions, uncertainty, caveats, recommendations, refusals, and level of detail?",
      },
      no_new_facts: {
        type: "noul",
        instructions:
          "Does the rewritten response avoid introducing any factual claim, technical claim, recommendation, caveat, or conclusion that was not present in the original?",
      },
      technical_literals_preserved: {
        type: "noul",
        instructions:
          "Are commands, code, identifiers, URLs, paths, numbers, quoted strings, and other technical literals preserved without semantic alteration?",
      },
    },
    options,
  );

  return {
    meaningPreserved: readNoul(answers.meaning_preserved),
    noNewFacts: readNoul(answers.no_new_facts),
    technicalLiteralsPreserved: readNoul(answers.technical_literals_preserved),
  };
}
