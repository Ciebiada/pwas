import { INDENT, insert, lineEnd } from "../utils";
import { handleEmptyLineEnter, handleIndentBackspace } from "./helpers";
import { MarkdownFeature } from "./types";

export const UnorderedListFeature: MarkdownFeature = {
  name: "unorderedList",
  pattern: /^(\s*[-*] )(?!\[[ x]\])/,

  onEnter(content, selection, match, lineRange) {
    const emptyLineResult = handleEmptyLineEnter(
      content,
      selection,
      match,
      lineRange,
      this.onBackspace!.bind(this),
    );
    if (emptyLineResult) return emptyLineResult;

    const prefix = match[1];
    return {
      content:
        content.slice(0, selection.start) +
        "\n" +
        prefix +
        content.slice(selection.end),
      cursor: selection.start + 1 + prefix.length,
    };
  },

  onBackspace(content, selection, match, lineRange) {
    const indentResult = handleIndentBackspace(content, selection, lineRange);
    if (indentResult) return indentResult;

    const { start: lineStart, line } = lineRange;
    const prefixLength = match[1].length;
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
    if (linePrefix === "*" || linePrefix === "-") {
      const replacement = linePrefix + " ";
      return {
        content: insert(content, lineStart, start, replacement),
        cursor: lineStart + replacement.length,
      };
    }

    // 2. Patterns/Conversions
    const patterns = [
      {
        pattern: /^(\s*)[-*] [-*]$/,
        replace: (m: RegExpMatchArray) => m[1] + INDENT + "- ",
      },
      {
        pattern: /^(\s*)[-*] \[[ x]\] [-*]$/,
        replace: (m: RegExpMatchArray) => m[1] + "- ",
      },
      {
        pattern: /^(\s*)\d+\. [-*]$/,
        replace: (m: RegExpMatchArray) => m[1] + "- ",
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
