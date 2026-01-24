import { INDENT, insert, lineEnd } from "../utils";
import { handleEmptyLineEnter, handleIndentBackspace } from "./helpers";
import type { MarkdownFeature } from "./types";

export const TodoListFeature: MarkdownFeature = {
  name: "todoList",
  pattern: /^(\s*[-*] )\[([ x])\]\s/,

  onEnter(content, selection, match, lineRange) {
    const emptyLineResult = handleEmptyLineEnter(content, selection, match, lineRange, this.onBackspace!.bind(this));
    if (emptyLineResult) return emptyLineResult;

    const newPrefix = `${match[1]}[ ] `;
    return {
      content: `${content.slice(0, selection.start)}\n${newPrefix}${content.slice(selection.end)}`,
      cursor: selection.start + 1 + newPrefix.length,
    };
  },

  onBackspace(content, selection, match, lineRange) {
    const indentResult = handleIndentBackspace(content, selection, lineRange);
    if (indentResult) return indentResult;

    const { start: lineStart, line } = lineRange;
    const prefixLength = match[0].length;
    return {
      content: content.slice(0, lineStart) + line.slice(prefixLength) + content.slice(lineEnd(content, lineStart)),
      cursor: lineStart,
    };
  },

  onInput(char, content, selection) {
    if (char !== " ") return null;
    const { start } = selection;
    const lineStart = content.lastIndexOf("\n", start - 1) + 1;
    const linePrefix = content.slice(lineStart, start);

    // 1. Simple expansion
    if (linePrefix === "[]" || linePrefix === "x" || linePrefix === "X") {
      const replacement = "- [ ] ";
      return {
        content: insert(content, lineStart, start, replacement),
        cursor: lineStart + replacement.length,
      };
    }

    // 2. Patterns/Conversions
    const patterns = [
      {
        pattern: /^(\s*)[-*] \[\]$/,
        replace: (m: RegExpMatchArray) => `${m[1]}- [ ] `,
      },
      {
        pattern: /^(\s*)[-*] [xX]$/,
        replace: (m: RegExpMatchArray) => `${m[1]}- [ ] `,
      },
      {
        pattern: /^(\s*)[-*] \[[ x]\] \[\]$/,
        replace: (m: RegExpMatchArray) => `${m[1] + INDENT}- [ ] `,
      },
      {
        pattern: /^(\s*)[-*] \[[ x]\] [xX]$/,
        replace: (m: RegExpMatchArray) => `${m[1] + INDENT}- [ ] `,
      },
      {
        pattern: /^(\s*)\d+\. \[\]$/,
        replace: (m: RegExpMatchArray) => `${m[1]}- [ ] `,
      },
      {
        pattern: /^(\s*)\d+\. [xX]$/,
        replace: (m: RegExpMatchArray) => `${m[1]}- [ ] `,
      },
    ];

    for (const { pattern, replace } of patterns) {
      const match = linePrefix.match(pattern);
      if (match) {
        const replacement = replace(match);
        return {
          content: insert(content, lineStart, start, replacement),
          cursor: lineStart + replacement.length,
        };
      }
    }

    return null;
  },
};

export const toggleCheckbox = (content: string, lineIndex: number): string => {
  const lines = content.split("\n");
  const line = lines[lineIndex];
  if (!line) return content;

  const checkboxPattern = /^(\s*[-*] )\[([ x])\]/;
  const match = line.match(checkboxPattern);
  if (!match) return content;

  const isChecked = match[2] === "x";
  const newStatus = isChecked ? " " : "x";
  const prefix = match[1];

  lines[lineIndex] = `${prefix}[${newStatus}]${line.slice(match[0].length)}`;

  return lines.join("\n");
};
