import { INDENT, INDENT_SIZE, insert, lineEnd } from "../utils";
import { handleEmptyLineEnter, handleIndentBackspace } from "./helpers";
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
    const emptyLineResult = handleEmptyLineEnter(
      content,
      selection,
      match,
      lineRange,
      this.onBackspace!.bind(this),
    );
    if (emptyLineResult) return emptyLineResult;

    const indent = match[1];
    const num = parseInt(match[2]);
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
    const indentResult = handleIndentBackspace(content, selection, lineRange);
    if (indentResult) {
      const { start: lineStart } = lineRange;
      const renumbered = renumberOrderedList(
        indentResult.content,
        indentResult.cursor,
      );
      const nextLinePos = renumbered.content.indexOf("\n", lineStart) + 1;
      if (nextLinePos > 0 && nextLinePos < renumbered.content.length) {
        const final = renumberOrderedList(renumbered.content, nextLinePos);
        return { content: final.content, cursor: renumbered.cursor };
      }
      return renumbered;
    }

    const { start: lineStart, line } = lineRange;
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
      const renumbered = renumberOrderedList(result.content, nextLinePos);
      return { content: renumbered.content, cursor: result.cursor };
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

export const renumberOrderedList = (
  content: string,
  cursor: number,
): { content: string; cursor: number } => {
  const lineRange = {
    start: content.lastIndexOf("\n", cursor - 1) + 1,
    end: lineEnd(content, cursor),
  };
  const currentLineText = content.slice(lineRange.start, lineRange.end);

  if (!/^(\s*)(\d+\.\s)/.test(currentLineText)) {
    const nextLineStart = lineRange.end + 1;
    if (nextLineStart < content.length) {
      const nextLineEnd = lineEnd(content, nextLineStart);
      const nextLineText = content.slice(nextLineStart, nextLineEnd);
      if (!/^(\s*)(\d+\.\s)/.test(nextLineText)) {
        return { content, cursor };
      }
    } else {
      return { content, cursor };
    }
  }

  const lines = content.split("\n");
  const lineIndex = content.slice(0, cursor).split("\n").length - 1;
  let currentCursor = cursor;

  const updateLine = (idx: number, newContent: string) => {
    const oldLength = lines[idx].length;
    const newLength = newContent.length;
    if (idx <= lineIndex) {
      currentCursor += newLength - oldLength;
    }
    lines[idx] = newContent;
  };

  const currentLine = lines[lineIndex];
  const currentMatch = currentLine.match(/^(\s*)(\d+\.\s)/);

  if (!currentMatch) {
    const nextLine = lines[lineIndex + 1];
    const nextMatch = nextLine?.match(/^(\s*)(\d+\.\s)/);
    if (!nextMatch) return { content, cursor };

    const indent = nextMatch[1];
    let expectedNum = 1;

    for (let i = lineIndex + 1; i < lines.length; i++) {
      const match = lines[i].match(/^(\s*)(\d+)\.\s(.*)/);
      if (!match || lines[i].trim() === "") break;

      const currentIndent = match[1];
      if (currentIndent.length < indent.length) break;
      if (currentIndent.length > indent.length) continue;

      updateLine(i, `${indent}${expectedNum}. ${match[3]}`);
      expectedNum++;
    }
    return { content: lines.join("\n"), cursor: currentCursor };
  }

  const indent = currentMatch[1];
  let startIdx = lineIndex;
  while (startIdx > 0) {
    const prevLine = lines[startIdx - 1];
    const indentMatch = prevLine.match(/^(\s*)/);
    const prevIndentLen = indentMatch ? indentMatch[1].length : 0;

    if (prevIndentLen > indent.length) {
      startIdx--;
      continue;
    }
    if (prevLine.trim() === "" || prevIndentLen < indent.length) break;

    if (/^\s*\d+\.\s/.test(prevLine)) {
      startIdx--;
    } else {
      break;
    }
  }

  let expectedNum = 0;
  for (let i = startIdx; i < lines.length; i++) {
    if (lines[i].trim() === "") break;

    const match = lines[i].match(/^(\s*)(\d+)\.\s(.*)/);
    if (!match) break;

    const currentIndent = match[1];
    if (currentIndent.length < indent.length) break;
    if (currentIndent.length > indent.length) continue;

    expectedNum++;
    updateLine(i, `${indent}${expectedNum}. ${match[3]}`);
  }

  return { content: lines.join("\n"), cursor: currentCursor };
};
