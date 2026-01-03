import { renumberOrderedList } from "../orderedList";
import { INDENT, INDENT_SIZE, insert } from "../utils";
import { MarkdownFeature } from "./types";

export const OrderedListFeature: MarkdownFeature = {
  name: "orderedList",
  pattern: /^(\s*)(\d+)\.\s/,

  onTab(content, selection, shiftKey, match, lineRange) {
    const { start: lineStart, line } = lineRange;

    if (shiftKey) {
      if (!line.startsWith(INDENT)) return null;
      const result = {
        content:
          content.slice(0, lineStart) +
          line.slice(INDENT_SIZE) +
          content.slice(lineEnd(content, lineStart)),
        cursor: selection.start - INDENT_SIZE,
      };

      const renumbered = renumberOrderedList(result.content, result.cursor);
      const nextLinePos = renumbered.content.indexOf("\n", lineStart) + 1;
      if (nextLinePos > 0 && nextLinePos < renumbered.content.length) {
        const final = renumberOrderedList(renumbered.content, nextLinePos);
        return { content: final.content, cursor: renumbered.cursor };
      }
      return renumbered;
    }

    const newLine = line.replace(/^(\s*)\d+\./, "$11.");
    const result = {
      content:
        content.slice(0, lineStart) +
        INDENT +
        newLine +
        content.slice(lineEnd(content, lineStart)),
      cursor: selection.start + INDENT_SIZE,
    };

    const renumbered = renumberOrderedList(result.content, result.cursor);
    const nextLinePos = renumbered.content.indexOf("\n", lineStart) + 1;
    if (nextLinePos > 0 && nextLinePos < renumbered.content.length) {
      const final = renumberOrderedList(renumbered.content, nextLinePos);
      return { content: final.content, cursor: renumbered.cursor };
    }
    return renumbered;
  },

  onEnter(content, selection, match, lineRange) {
    const { start: lineStart } = lineRange;
    const indent = match[1];
    const num = parseInt(match[2]);
    const prefix = match[0];

    const isAfterPrefix = selection.start === lineStart + prefix.length;
    const textAfter = content
      .slice(selection.start, lineEnd(content, lineStart))
      .trim();

    if (isAfterPrefix && textAfter === "") {
      return this.onBackspace!(content, selection, match, lineRange);
    }

    const newPrefix = `${indent}${num + 1}. `;
    const result = {
      content:
        content.slice(0, selection.start) +
        "\n" +
        newPrefix +
        content.slice(selection.end),
      cursor: selection.start + 1 + newPrefix.length,
    };

    return renumberOrderedList(result.content, result.cursor);
  },

  onBackspace(content, selection, match, lineRange) {
    const { start: lineStart, line } = lineRange;

    if (line.startsWith(INDENT)) {
      const result = {
        content:
          content.slice(0, lineStart) +
          line.slice(INDENT_SIZE) +
          content.slice(lineEnd(content, lineStart)),
        cursor: selection.start - INDENT_SIZE,
      };

      const renumbered = renumberOrderedList(result.content, result.cursor);
      const nextLinePos = renumbered.content.indexOf("\n", lineStart) + 1;
      if (nextLinePos > 0 && nextLinePos < renumbered.content.length) {
        const final = renumberOrderedList(renumbered.content, nextLinePos);
        return { content: final.content, cursor: renumbered.cursor };
      }
      return renumbered;
    }

    const prefixLength = match[0].length;
    const result = {
      content:
        content.slice(0, lineStart) +
        line.slice(prefixLength) +
        content.slice(lineEnd(content, lineStart)),
      cursor: lineStart,
    };

    const nextLinePos = result.content.indexOf("\n", lineStart) + 1;
    if (nextLinePos > 0 && nextLinePos < result.content.length) {
      return renumberOrderedList(result.content, nextLinePos);
    }
    return result;
  },

  onInput(char, content, selection) {
    if (char !== " ") return null;
    const { start } = selection;
    const lineStart = content.lastIndexOf("\n", start - 1) + 1;
    const linePrefix = content.slice(lineStart, start);

    // 1. Simple expansion
    if (linePrefix === "1.") {
      const replacement = "1. ";
      const expanded = {
        content: insert(content, lineStart, start, replacement),
        cursor: lineStart + replacement.length,
      };
      return renumberOrderedList(expanded.content, expanded.cursor);
    }

    // 2. Conversion/Patterns
    const patterns = [
      {
        pattern: /^(\s*)[-*] 1\.$/,
        replace: (m: RegExpMatchArray) => m[1] + "1. ",
      },
      {
        pattern: /^(\s*)[-*] \[[ x]\] 1\.$/,
        replace: (m: RegExpMatchArray) => m[1] + "1. ",
      },
      {
        pattern: /^(\s*)\d+\. 1\.$/,
        replace: (m: RegExpMatchArray) => m[1] + INDENT + "1. ",
      },
    ];

    for (const { pattern, replace } of patterns) {
      const match = linePrefix.match(pattern);
      if (match) {
        const replacement = replace(match);
        const expanded = {
          content: insert(content, lineStart, start, replacement),
          cursor: lineStart + replacement.length,
        };
        return renumberOrderedList(expanded.content, expanded.cursor);
      }
    }

    return null;
  },
};

const lineEnd = (content: string, start: number) => {
  const index = content.indexOf("\n", start);
  return index === -1 ? content.length : index;
};
