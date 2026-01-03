import { INDENT, INDENT_SIZE, insert } from "../utils";
import { MarkdownFeature } from "./types";

export const TodoListFeature: MarkdownFeature = {
  name: "todoList",
  pattern: /^(\s*[-*] )\[([ x])\]\s/,

  onEnter(content, selection, match, lineRange) {
    const { start: lineStart } = lineRange;
    const prefix = match[0];
    const isAfterPrefix = selection.start === lineStart + prefix.length;
    const textAfter = content
      .slice(selection.start, lineEnd(content, lineStart))
      .trim();

    if (isAfterPrefix && textAfter === "") {
      return this.onBackspace!(content, selection, match, lineRange);
    }

    const newPrefix = match[1] + "[ ] ";
    return {
      content:
        content.slice(0, selection.start) +
        "\n" +
        newPrefix +
        content.slice(selection.end),
      cursor: selection.start + 1 + newPrefix.length,
    };
  },

  onBackspace(content, selection, match, lineRange) {
    const { start: lineStart, line } = lineRange;

    if (line.startsWith(INDENT)) {
      return {
        content:
          content.slice(0, lineStart) +
          line.slice(INDENT_SIZE) +
          content.slice(lineEnd(content, lineStart)),
        cursor: selection.start - INDENT_SIZE,
      };
    }

    const prefixLength = match[0].length;
    return {
      content:
        content.slice(0, lineStart) +
        line.slice(prefixLength) +
        content.slice(lineEnd(content, lineStart)),
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
        replace: (m: RegExpMatchArray) => m[1] + "- [ ] ",
      },
      {
        pattern: /^(\s*)[-*] [xX]$/,
        replace: (m: RegExpMatchArray) => m[1] + "- [ ] ",
      },
      {
        pattern: /^(\s*)[-*] \[[ x]\] \[\]$/,
        replace: (m: RegExpMatchArray) => m[1] + INDENT + "- [ ] ",
      },
      {
        pattern: /^(\s*)[-*] \[[ x]\] [xX]$/,
        replace: (m: RegExpMatchArray) => m[1] + INDENT + "- [ ] ",
      },
      {
        pattern: /^(\s*)\d+\. \[\]$/,
        replace: (m: RegExpMatchArray) => m[1] + "- [ ] ",
      },
      {
        pattern: /^(\s*)\d+\. [xX]$/,
        replace: (m: RegExpMatchArray) => m[1] + "- [ ] ",
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

const lineEnd = (content: string, start: number) => {
  const index = content.indexOf("\n", start);
  return index === -1 ? content.length : index;
};
