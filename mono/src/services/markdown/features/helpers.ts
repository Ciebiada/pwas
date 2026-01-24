import { INDENT, INDENT_SIZE, type InputResult, lineEnd, type Selection } from "../utils";
import type { LineRange } from "./types";

export const handleIndentBackspace = (
  content: string,
  selection: Selection,
  lineRange: LineRange,
): InputResult | null => {
  const { start: lineStart, line } = lineRange;
  if (!line.startsWith(INDENT)) return null;

  return {
    content: content.slice(0, lineStart) + line.slice(INDENT_SIZE) + content.slice(lineEnd(content, lineStart)),
    cursor: selection.start - INDENT_SIZE,
  };
};

export const handleEmptyLineEnter = (
  content: string,
  selection: Selection,
  match: RegExpMatchArray,
  lineRange: LineRange,
  onBackspace: (
    content: string,
    selection: Selection,
    match: RegExpMatchArray,
    lineRange: LineRange,
  ) => InputResult | null,
): InputResult | null => {
  const { start: lineStart } = lineRange;
  const prefix = match[0];
  const isAfterPrefix = selection.start === lineStart + prefix.length;
  const textAfter = content.slice(selection.start, lineEnd(content, lineStart)).trim();

  if (isAfterPrefix && textAfter === "") {
    return onBackspace(content, selection, match, lineRange);
  }

  return null;
};
