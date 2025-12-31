type Selection = { start: number; end: number };
type InputResult = { content: string; cursor: number };

export const INDENT = "    ";
const INDENT_SIZE = INDENT.length;

const LIST_PATTERN = /^(\s*-\s(?:\[[ x]\]\s)?)/;

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

  const newPrefix = prefix.includes("[x]")
    ? prefix.replace("[x]", "[ ]")
    : prefix;

  return {
    content: content.slice(0, start) + "\n" + newPrefix + content.slice(end),
    cursor: start + 1 + newPrefix.length,
  };
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

  return {
    content:
      content.slice(0, lineStart) +
      line.slice(prefixLength) +
      content.slice(lineEnd),
    cursor: lineStart,
  };
};

export const toggleCheckbox = (content: string, lineIndex: number): string => {
  const lines = content.split("\n");
  const line = lines[lineIndex];

  if (line.includes("- [ ]")) {
    lines[lineIndex] = line.replace("- [ ]", "- [x]");
  } else if (line.includes("- [x]")) {
    lines[lineIndex] = line.replace("- [x]", "- [ ]");
  }

  return lines.join("\n");
};
