// Shared per-line tokenizer. A single source of truth for block classification,
// code-fence tracking, and heading detection.

export type LineTokenType =
  | "h1"
  | "h2"
  | "h3"
  | "paragraph"
  | "checkbox"
  | "list"
  | "orderedList"
  | "table"
  | "codeFence"
  | "codeContent";

export type LineToken = {
  type: LineTokenType;
  prefix: string;
  content: string;
  disableInlineMarkdown?: boolean;
  codeBlockId?: string;
  codeFenceKind?: "open" | "close";
};

export const CODE_FENCE = "```";

const BLOCK_PATTERNS = [
  { type: "table" as const, regex: /^()(\|.*)$/ },
  { type: "h3" as const, regex: /^(### )(.*)/ },
  { type: "h2" as const, regex: /^(## )(.*)/ },
  { type: "h1" as const, regex: /^(# )(.*)/ },
  { type: "checkbox" as const, regex: /^(\s*[-*] \[(?:x| )\] )(.*)/ },
  { type: "orderedList" as const, regex: /^(\s*\d+\. )(.*)/ },
  { type: "list" as const, regex: /^(\s*[-*] )(.*)/ },
];

const isOpeningCodeFence = (line: string) => line.startsWith(CODE_FENCE);

const isClosingCodeFence = (line: string) => line.trim() === CODE_FENCE;

const findClosingCodeFence = (lines: string[], startIndex: number) => {
  for (let index = startIndex + 1; index < lines.length; index++) {
    if (isClosingCodeFence(lines[index])) return index;
  }
  return -1;
};

const parseBlockLine = (line: string, index: number): LineToken => {
  if (index === 0) return { type: "paragraph", prefix: "", content: line, disableInlineMarkdown: true };

  for (const pattern of BLOCK_PATTERNS) {
    const match = line.match(pattern.regex);
    if (match) return { type: pattern.type, prefix: match[1], content: match[2] };
  }
  return { type: "paragraph", prefix: "", content: line };
};

export const tokenizeLines = (markdown: string): LineToken[] => {
  const tokens: LineToken[] = [];
  const lines = markdown.split("\n");
  let activeCodeBlockId: string | null = null;
  let codeBlockCount = 0;
  let activeCodeBlockClosingIndex = -1;

  for (const [index, line] of lines.entries()) {
    if (index === 0) {
      tokens.push(parseBlockLine(line, index));
      continue;
    }

    if (activeCodeBlockId) {
      if (index === activeCodeBlockClosingIndex) {
        tokens.push({
          type: "codeFence",
          prefix: "",
          content: line,
          codeBlockId: activeCodeBlockId,
          codeFenceKind: "close",
        });
        activeCodeBlockId = null;
        activeCodeBlockClosingIndex = -1;
        continue;
      }

      tokens.push({
        type: "codeContent",
        prefix: "",
        content: line,
        disableInlineMarkdown: true,
        codeBlockId: activeCodeBlockId,
      });
      continue;
    }

    if (isOpeningCodeFence(line)) {
      const closingFenceIndex = findClosingCodeFence(lines, index);
      if (closingFenceIndex === -1) {
        tokens.push(parseBlockLine(line, index));
        continue;
      }

      activeCodeBlockId = `code-block-${codeBlockCount++}`;
      activeCodeBlockClosingIndex = closingFenceIndex;
      tokens.push({
        type: "codeFence",
        prefix: "",
        content: line,
        codeBlockId: activeCodeBlockId,
        codeFenceKind: "open",
      });
      continue;
    }

    tokens.push(parseBlockLine(line, index));
  }

  return tokens;
};
