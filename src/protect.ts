export interface ProtectedText {
  text: string;
  literals: string[];
  prefix: string;
}

const PATTERNS: RegExp[] = [
  /```[\s\S]*?```/g,
  /~~~[\s\S]*?~~~/g,
  /`[^`\n]+`/g,
  /https?:\/\/[^\s<>)\]}]+/g,
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function protectLiterals(input: string): ProtectedText {
  let prefix = "__PI_ANTI_SLOP_LITERAL_";
  while (input.includes(prefix)) prefix = "_" + prefix;

  const literals: string[] = [];
  let text = input;

  for (const pattern of PATTERNS) {
    text = text.replace(pattern, (match) => {
      const index = literals.push(match) - 1;
      return `${prefix}${index}__`;
    });
  }

  return { text, literals, prefix };
}

export function restoreLiterals(rewritten: string, protectedText: ProtectedText): string {
  const { literals, prefix } = protectedText;
  const tokenPattern = new RegExp(`${escapeRegExp(prefix)}(\\d+)__`, "g");
  const seen = new Map<number, number>();

  for (const match of rewritten.matchAll(tokenPattern)) {
    const index = Number(match[1]);
    seen.set(index, (seen.get(index) ?? 0) + 1);
  }

  for (let i = 0; i < literals.length; i++) {
    if (seen.get(i) !== 1) {
      throw new Error(`Protected literal placeholder ${i} was changed or duplicated`);
    }
  }

  for (const index of seen.keys()) {
    if (!Number.isInteger(index) || index < 0 || index >= literals.length) {
      throw new Error(`Unknown protected literal placeholder ${index}`);
    }
  }

  return rewritten.replace(tokenPattern, (_match, indexText: string) => {
    return literals[Number(indexText)]!;
  });
}
