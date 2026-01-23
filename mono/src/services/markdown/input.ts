import { INDENT, INDENT_SIZE, InputResult, LIST_PATTERN, TABLE_PATTERN, Selection, getLineRange } from "./utils";
import { MARKDOWN_FEATURES } from "./features";

export const handleBlockTab = (content: string, selection: Selection, shiftKey: boolean): InputResult | null => {
  const lineRange = getLineRange(content, selection.start);
  const { start: lineStart, line } = lineRange;

  // Check if line matches any navigable block (list or table)
  const isTable = line.match(TABLE_PATTERN);
  if (!line.match(LIST_PATTERN) && !isTable) return null;

  // Try features
  for (const feature of MARKDOWN_FEATURES) {
    const match = line.match(feature.pattern);
    if (match && feature.onTab) {
      const result = feature.onTab(content, selection, shiftKey, match, lineRange);
      if (result) return result;
    }
  }

  // Default generic indentation handling (lists only)
  if (!isTable) {
    if (shiftKey) {
      if (!line.startsWith(INDENT)) return null;
      return {
        content: content.slice(0, lineStart) + line.slice(INDENT_SIZE) + content.slice(lineRange.end),
        cursor: selection.start - INDENT_SIZE,
      };
    }

    return {
      content: content.slice(0, lineStart) + INDENT + line + content.slice(lineRange.end),
      cursor: selection.start + INDENT_SIZE,
    };
  }

  return null;
};

export const handleTab = (content: string, selection: Selection, shiftKey: boolean): InputResult => {
  const blockResult = handleBlockTab(content, selection, shiftKey);
  if (blockResult) return blockResult;

  return shiftKey
    ? { content, cursor: selection.start }
    : {
        content: content.slice(0, selection.start) + INDENT + content.slice(selection.end),
        cursor: selection.start + INDENT_SIZE,
      };
};

const trimLineBeforeNewline = (result: InputResult): InputResult => {
  const newlinePos = result.content.lastIndexOf("\n", result.cursor - 1);
  if (newlinePos === -1) return result;

  const lineStart = result.content.lastIndexOf("\n", newlinePos - 1) + 1;
  const lineBeforeNewline = result.content.slice(lineStart, newlinePos);
  const trimmed = lineBeforeNewline.trimEnd();
  const removed = lineBeforeNewline.length - trimmed.length;

  if (removed === 0) return result;

  return {
    content: result.content.slice(0, lineStart) + trimmed + result.content.slice(newlinePos),
    cursor: result.cursor - removed,
  };
};

export const handleEnter = (content: string, selection: Selection): InputResult => {
  const { start, end } = selection;
  const lineRange = getLineRange(content, start);
  const { start: lineStart, line: lineContent } = lineRange;
  const beforeCursor = lineContent.slice(0, start - lineStart);

  // Check if we are in a list or table line
  const isListLine = beforeCursor.match(LIST_PATTERN);
  const isTableLine = lineContent.match(TABLE_PATTERN);

  if (isListLine || isTableLine) {
    // Use full line for table, beforeCursor for lists
    const lineToMatch = isTableLine ? lineContent : beforeCursor;

    for (const feature of MARKDOWN_FEATURES) {
      const match = lineToMatch.match(feature.pattern);
      if (match && feature.onEnter) {
        const result = feature.onEnter(content, selection, match, lineRange);
        if (result) return trimLineBeforeNewline(result);
      }
    }
  }

  // Default enter behavior
  const result = {
    content: content.slice(0, start) + "\n" + content.slice(end),
    cursor: start + 1,
  };
  return trimLineBeforeNewline(result);
};

export const handleBackspaceAtListStart = (content: string, selection: Selection): InputResult | null => {
  const { start, end } = selection;
  if (start !== end) return null;

  const lineRange = getLineRange(content, start);
  const { start: lineStart, line } = lineRange;

  const listMatch = line.match(LIST_PATTERN);
  const isTableLine = line.match(TABLE_PATTERN);

  // For lists, check cursor position
  if (listMatch) {
    const prefix = listMatch[1];
    const cursorInLine = start - lineStart;

    if (cursorInLine === prefix.length) {
      for (const feature of MARKDOWN_FEATURES) {
        const fMatch = line.match(feature.pattern);
        if (fMatch && feature.onBackspace) {
          const result = feature.onBackspace(content, selection, fMatch, lineRange);
          if (result) return result;
        }
      }
    }
  }

  // For tables, use feature loop
  if (isTableLine) {
    for (const feature of MARKDOWN_FEATURES) {
      const fMatch = line.match(feature.pattern);
      if (fMatch && feature.onBackspace) {
        const result = feature.onBackspace(content, selection, fMatch, lineRange);
        if (result) return result;
      }
    }
  }

  return null;
};

export const handleInput = (char: string, content: string, selection: Selection): InputResult | null => {
  for (const feature of MARKDOWN_FEATURES) {
    if (feature.onInput) {
      const result = feature.onInput(char, content, selection);
      if (result) return result;
    }
  }
  return null;
};
