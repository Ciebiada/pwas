type Selection = { start: number; end: number };
type InputResult = { content: string; cursor: number };

export const INDENT = "    ";
const INDENT_SIZE = INDENT.length;

const LIST_PATTERN = /^(\s*([-*]|\d+\.)\s(?:\[[ x]\]\s)?)/;

const getLineRange = (content: string, position: number) => {
  const start = content.lastIndexOf("\n", position - 1) + 1;
  const endIndex = content.indexOf("\n", position);
  const end = endIndex === -1 ? content.length : endIndex;
  return { start, end, line: content.slice(start, end) };
};

export const handleListTab = (
  content: string,
  selection: Selection,
  shiftKey: boolean,
): InputResult | null => {
  const {
    start: lineStart,
    end: lineEnd,
    line,
  } = getLineRange(content, selection.start);
  const match = line.match(LIST_PATTERN);

  if (!match) return null;

  if (shiftKey) {
    if (!line.startsWith(INDENT)) return null;
    return {
      content:
        content.slice(0, lineStart) +
        line.slice(INDENT_SIZE) +
        content.slice(lineEnd),
      cursor: selection.start - INDENT_SIZE,
    };
  }

  return {
    content:
      content.slice(0, lineStart) + INDENT + line + content.slice(lineEnd),
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
  const { start: lineStart, line: lineContent } = getLineRange(content, start);
  const beforeCursor = lineContent.slice(0, start - lineStart);
  const afterCursor = content.slice(
    start,
    content.indexOf("\n", start) === -1
      ? undefined
      : content.indexOf("\n", start),
  );

  const match = beforeCursor.match(LIST_PATTERN);

  if (!match) {
    return {
      content: content.slice(0, start) + "\n" + content.slice(end),
      cursor: start + 1,
    };
  }

  const prefix = match[1];
  const isEmptyListItem =
    beforeCursor.trim() === prefix.trim() && afterCursor.trim() === "";

  if (isEmptyListItem) {
    return unindentOrRemoveList(content, start);
  }

  let newPrefix = prefix.includes("[x]")
    ? prefix.replace("[x]", "[ ]")
    : prefix;

  const orderedMatch = prefix.match(/^(\s*)(\d+)\.\s/);
  if (orderedMatch) {
    const indent = orderedMatch[1];
    const num = parseInt(orderedMatch[2]);
    newPrefix = `${indent}${num + 1}. `;
  }

  const result = {
    content: content.slice(0, start) + "\n" + newPrefix + content.slice(end),
    cursor: start + 1 + newPrefix.length,
  };

  if (orderedMatch) {
    const renumbered = renumberOrderedList(result.content, result.cursor);
    result.content = renumbered.content;
    result.cursor = renumbered.cursor;
  }

  return result;
};

export const handleBackspaceAtListStart = (
  content: string,
  selection: Selection,
): InputResult | null => {
  const { start, end } = selection;
  if (start !== end) return null;

  const { start: lineStart, line } = getLineRange(content, start);
  const match = line.match(LIST_PATTERN);
  if (!match) return null;

  const prefix = match[1];
  const cursorInLine = start - lineStart;

  if (cursorInLine !== prefix.length) return null;

  return unindentOrRemoveList(content, start);
};

const unindentOrRemoveList = (content: string, cursor: number): InputResult => {
  const {
    start: lineStart,
    end: lineEnd,
    line,
  } = getLineRange(content, cursor);

  if (line.startsWith(INDENT)) {
    return {
      content:
        content.slice(0, lineStart) +
        line.slice(INDENT_SIZE) +
        content.slice(lineEnd),
      cursor: cursor - INDENT_SIZE,
    };
  }

  const match = line.match(LIST_PATTERN);
  const prefixLength = match ? match[1].length : 0;
  const isOrdered = match && /^(\s*)\d+\.\s/.test(match[1]);

  const result = {
    content:
      content.slice(0, lineStart) +
      line.slice(prefixLength) +
      content.slice(lineEnd),
    cursor: lineStart,
  };

  if (isOrdered) {
    const renumbered = renumberOrderedList(result.content, result.cursor);
    result.content = renumbered.content;
    result.cursor = renumbered.cursor;
  }

  return result;
};

export const renumberOrderedList = (
  content: string,
  cursor: number,
): { content: string; cursor: number } => {
  // Optimization: Check if current or neighboring lines are ordered lists before splitting
  const { start: lineStart, end: lineEnd } = getLineRange(content, cursor);
  const currentLineText = content.slice(lineStart, lineEnd);

  // Check active line
  if (!/^(\s*)(\d+\.\s)/.test(currentLineText)) {
    // Check next line content efficiently
    const nextLineStart = lineEnd + 1; // Skip newline
    if (nextLineStart < content.length) {
      const nextLineEnd = content.indexOf("\n", nextLineStart);
      const nextLineText = content.slice(
        nextLineStart,
        nextLineEnd === -1 ? content.length : nextLineEnd,
      );
      if (!/^(\s*)(\d+\.\s)/.test(nextLineText)) {
        return { content, cursor };
      }
    } else {
      // No next line, and current line isn't a list
      return { content, cursor };
    }
  }

  const lines = content.split("\n");
  const lineIndex = content.slice(0, cursor).split("\n").length - 1;
  let currentCursor = cursor;

  const updateLine = (idx: number, newContent: string) => {
    const oldLength = lines[idx].length;
    const newLength = newContent.length;
    if (idx < lineIndex) {
      currentCursor += newLength - oldLength;
    } else if (idx === lineIndex) {
      // If cursor is on the line being updated, we assume it's after the prefix
      // and needs to move with the prefix change.
      currentCursor += newLength - oldLength;
    }
    lines[idx] = newContent;
  };

  // Find the start of the current ordered list block at this indentation level
  const currentLine = lines[lineIndex];
  const currentMatch = currentLine.match(/^(\s*)(\d+\.\s)/);

  if (!currentMatch) {
    // If current line is no longer an ordered list (e.g. just removed prefix),
    // we still want to renumber the rest. We need the indent of the *rest*.
    const nextLine = lines[lineIndex + 1];
    const nextMatch = nextLine?.match(/^(\s*)(\d+\.\s)/);
    if (!nextMatch) return { content, cursor };

    const indent = nextMatch[1];
    let expectedNum = 1;
    if (lineIndex > 0) {
      const prevMatch = lines[lineIndex - 1].match(/^(\s*)(\d+)\.\s/);
      if (prevMatch && prevMatch[1] === indent) {
        expectedNum = parseInt(prevMatch[2]) + 1;
      }
    }

    for (let i = lineIndex + 1; i < lines.length; i++) {
      const match = lines[i].match(/^(\s*)(\d+)\.\s(.*)/);
      if (match && match[1] === indent) {
        updateLine(i, `${indent}${expectedNum}. ${match[3]}`);
        expectedNum++;
      } else if (match && match[1].length > indent.length) {
        continue; // Nested list
      } else {
        break;
      }
    }
    return { content: lines.join("\n"), cursor: currentCursor };
  }

  const indent = currentMatch[1];
  let startIdx = lineIndex;
  while (startIdx > 0) {
    const prevMatch = lines[startIdx - 1].match(/^(\s*)(\d+)\.\s/);
    if (prevMatch && prevMatch[1] === indent) {
      startIdx--;
    } else {
      break;
    }
  }

  let expectedNum = parseInt(lines[startIdx].match(/\d+/)?.[0] || "1");
  for (let i = startIdx + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)(\d+)\.\s(.*)/);
    if (match && match[1] === indent) {
      expectedNum++;
      updateLine(i, `${indent}${expectedNum}. ${match[3]}`);
    } else if (match && match[1].length > indent.length) {
      continue; // Nested list
    } else {
      break;
    }
  }

  return { content: lines.join("\n"), cursor: currentCursor };
};

export const toggleCheckbox = (content: string, lineIndex: number): string => {
  const lines = content.split("\n");
  const line = lines[lineIndex];

  const match = line.match(/^(\s*[-*] )\[([ x])\](.*)/);
  if (match) {
    const prefix = match[1];
    const isChecked = match[2] === "x";
    const rest = match[3];
    lines[lineIndex] = `${prefix}[${isChecked ? " " : "x"}]${rest}`;
  }

  return lines.join("\n");
};
