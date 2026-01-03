import {
  INDENT,
  INDENT_SIZE,
  InputResult,
  LIST_PATTERN,
  Selection,
  getLineRange,
} from "./utils";
import { MARKDOWN_FEATURES } from "./features";

export const handleListTab = (
  content: string,
  selection: Selection,
  shiftKey: boolean,
): InputResult | null => {
  const lineRange = getLineRange(content, selection.start);
  const { start: lineStart, line } = lineRange;

  // Generic check if it's a list at all
  if (!line.match(LIST_PATTERN)) return null;

  // Try features first
  for (const feature of MARKDOWN_FEATURES) {
    const match = line.match(feature.pattern);
    if (match && feature.onTab) {
      const result = feature.onTab(
        content,
        selection,
        shiftKey,
        match,
        lineRange,
      );
      if (result) return result;
    }
  }

  // Default generic indentation handling
  if (shiftKey) {
    if (!line.startsWith(INDENT)) return null;
    return {
      content:
        content.slice(0, lineStart) +
        line.slice(INDENT_SIZE) +
        content.slice(lineRange.end),
      cursor: selection.start - INDENT_SIZE,
    };
  }

  return {
    content:
      content.slice(0, lineStart) +
      INDENT +
      line +
      content.slice(lineRange.end),
    cursor: selection.start + INDENT_SIZE,
  };
};

export const handleTab = (
  content: string,
  selection: Selection,
  shiftKey: boolean,
): InputResult => {
  const listResult = handleListTab(content, selection, shiftKey);
  if (listResult) return listResult;

  return {
    content:
      content.slice(0, selection.start) + INDENT + content.slice(selection.end),
    cursor: selection.start + INDENT_SIZE,
  };
};

export const handleEnter = (
  content: string,
  selection: Selection,
): InputResult => {
  const { start, end } = selection;
  const lineRange = getLineRange(content, start);
  const { start: lineStart, line: lineContent } = lineRange;
  const beforeCursor = lineContent.slice(0, start - lineStart);

  // Quick check if we are in a list
  if (beforeCursor.match(LIST_PATTERN)) {
    for (const feature of MARKDOWN_FEATURES) {
      const match = beforeCursor.match(feature.pattern);
      if (match && feature.onEnter) {
        const result = feature.onEnter(content, selection, match, lineRange);
        if (result) return result;
      }
    }
  }

  // Default enter behavior
  return {
    content: content.slice(0, start) + "\n" + content.slice(end),
    cursor: start + 1,
  };
};

export const handleBackspaceAtListStart = (
  content: string,
  selection: Selection,
): InputResult | null => {
  const { start, end } = selection;
  if (start !== end) return null;

  const lineRange = getLineRange(content, start);
  const { start: lineStart, line } = lineRange;

  const match = line.match(LIST_PATTERN);
  if (!match) return null;

  const prefix = match[1];
  const cursorInLine = start - lineStart;

  if (cursorInLine !== prefix.length) return null;

  // Delegate to features
  for (const feature of MARKDOWN_FEATURES) {
    const fMatch = line.match(feature.pattern);
    if (fMatch && feature.onBackspace) {
      const result = feature.onBackspace(content, selection, fMatch, lineRange);
      if (result) return result;
    }
  }

  return null;
};

export const handleInput = (
  char: string,
  content: string,
  selection: Selection,
): InputResult | null => {
  for (const feature of MARKDOWN_FEATURES) {
    if (feature.onInput) {
      const result = feature.onInput(char, content, selection);
      if (result) return result;
    }
  }
  return null;
};
