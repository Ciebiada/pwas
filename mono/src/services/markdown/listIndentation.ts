import { calculateCursorPosition } from "../cursor";
import { syncTaskCookies } from "./features/cookie";
import { renumberOrderedList } from "./features/orderedList";
import { INDENT, INDENT_SIZE, LIST_PATTERN, type Selection } from "./utils";

type ContentLine = {
  text: string;
  start: number;
  end: number;
};

type ListIndentDirection = "indent" | "unindent";

type ListIndentResult = {
  content: string;
  selection: Selection;
};

const ORDERED_LIST_PATTERN = /^(\s*)\d+\.\s/;

const getLines = (content: string): ContentLine[] => {
  let start = 0;

  return content.split("\n").map((text) => {
    const line = {
      text,
      start,
      end: start + text.length,
    };

    start = line.end + 1;
    return line;
  });
};

const getLineIndexAtPosition = (lines: ContentLine[], position: number) => {
  if (lines.length === 0) return 0;

  const lastLine = lines[lines.length - 1];
  const target = Math.min(position, lastLine.end);
  const index = lines.findIndex((line) => target <= line.end);
  return index === -1 ? lines.length - 1 : index;
};

const getSelectedLineIndexes = (content: string, lines: ContentLine[], selection: Selection) => {
  const start = Math.min(selection.start, selection.end);
  const end = Math.max(selection.start, selection.end);
  const effectiveEnd = end > start && content[end - 1] === "\n" ? end - 1 : end;
  const startIndex = getLineIndexAtPosition(lines, start);
  const endIndex = getLineIndexAtPosition(lines, effectiveEnd);

  return Array.from({ length: endIndex - startIndex + 1 }, (_, index) => startIndex + index);
};

const getSelectedListLineIndexes = (content: string, selection: Selection) => {
  const lines = getLines(content);
  return getSelectedLineIndexes(content, lines, selection).filter((index) => {
    const line = lines[index];
    return line && line.start !== 0 && LIST_PATTERN.test(line.text);
  });
};

const mapSelection = (fromContent: string, toContent: string, selection: Selection): Selection => {
  if (fromContent === toContent) return selection;

  return {
    start: calculateCursorPosition(fromContent, toContent, selection.start),
    end: calculateCursorPosition(fromContent, toContent, selection.end),
  };
};

const renumberOrderedListsAround = (
  content: string,
  selection: Selection,
  lineIndexes: Set<number>,
): ListIndentResult => {
  let nextContent = content;
  let nextSelection = selection;

  for (const index of Array.from(lineIndexes).sort((a, b) => a - b)) {
    const line = getLines(nextContent)[index];
    if (!line) continue;

    const previousContent = nextContent;
    const renumbered = renumberOrderedList(nextContent, line.start);
    nextContent = renumbered.content;
    nextSelection = mapSelection(previousContent, nextContent, nextSelection);
  }

  return {
    content: nextContent,
    selection: nextSelection,
  };
};

const syncTaskCookiesWithSelection = (content: string, selection: Selection): ListIndentResult => {
  const nextContent = syncTaskCookies(content);

  return {
    content: nextContent,
    selection: mapSelection(content, nextContent, selection),
  };
};

export const canIndentListSelection = (content: string, selection: Selection) =>
  getSelectedListLineIndexes(content, selection).length > 0;

export const canUnindentListSelection = (content: string, selection: Selection) => {
  const lines = getLines(content);
  return getSelectedLineIndexes(content, lines, selection).some((index) => {
    const line = lines[index];
    return line && line.start !== 0 && LIST_PATTERN.test(line.text) && line.text.startsWith(INDENT);
  });
};

export const indentListSelection = (
  content: string,
  selection: Selection,
  direction: ListIndentDirection,
): ListIndentResult | null => {
  const lines = getLines(content);
  const selectedListIndexes = getSelectedLineIndexes(content, lines, selection).filter((index) => {
    const line = lines[index];
    return line && line.start !== 0 && LIST_PATTERN.test(line.text);
  });

  if (selectedListIndexes.length === 0) return null;

  const nextLines = lines.map((line) => line.text);
  const orderedLineIndexes = new Set<number>();
  let changed = false;

  for (const index of selectedListIndexes) {
    const line = lines[index];
    if (!line) continue;

    if (ORDERED_LIST_PATTERN.test(line.text)) {
      orderedLineIndexes.add(index);
      orderedLineIndexes.add(index + 1);
    }

    if (direction === "indent") {
      nextLines[index] = INDENT + line.text.replace(/^(\s*)\d+\./, "$11.");
      changed = true;
      continue;
    }

    if (!line.text.startsWith(INDENT)) continue;

    nextLines[index] = line.text.slice(INDENT_SIZE);
    changed = true;
  }

  if (!changed) return null;

  const editedContent = nextLines.join("\n");
  const editedSelection = mapSelection(content, editedContent, selection);
  const renumbered = renumberOrderedListsAround(editedContent, editedSelection, orderedLineIndexes);
  return syncTaskCookiesWithSelection(renumbered.content, renumbered.selection);
};
