import { calculateCursorPosition } from "../cursor";
import { syncTaskCookies } from "./features/cookie";
import { type Selection, TODO_LIST_PATTERN, UNORDERED_LIST_PATTERN } from "./utils";

type ContentLine = {
  text: string;
  start: number;
  end: number;
};

type ListConversionResult = {
  content: string;
  selection: Selection;
};

type ListConversion = "bullet-to-todo" | "todo-to-bullet" | "list-to-regular" | "regular-to-bullet" | "regular-to-todo";

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

const mapSelection = (fromContent: string, toContent: string, selection: Selection): Selection => {
  if (fromContent === toContent) return selection;

  return {
    start: calculateCursorPosition(fromContent, toContent, selection.start),
    end: calculateCursorPosition(fromContent, toContent, selection.end),
  };
};

const normalizeBulletPrefix = (prefix: string) => `${prefix.slice(0, -2)}- `;

const getSelectedConvertibleLineIndexes = (content: string, selection: Selection, conversion: ListConversion) => {
  const lines = getLines(content);
  const pattern = conversion === "bullet-to-todo" ? UNORDERED_LIST_PATTERN : TODO_LIST_PATTERN;

  return getSelectedLineIndexes(content, lines, selection).filter((index) => {
    const line = lines[index];
    if (!line || line.start === 0) return false;
    if (conversion === "regular-to-bullet" || conversion === "regular-to-todo") {
      if (line.text.trim() === "") return false;
      if (line.text.startsWith("#")) return false;
      if (UNORDERED_LIST_PATTERN.test(line.text)) return false;
      if (TODO_LIST_PATTERN.test(line.text)) return false;
      return true;
    }
    if (conversion === "list-to-regular")
      return TODO_LIST_PATTERN.test(line.text) || UNORDERED_LIST_PATTERN.test(line.text);
    return pattern.test(line.text);
  });
};

export const canTurnBulletSelectionToTodo = (content: string, selection: Selection) =>
  getSelectedConvertibleLineIndexes(content, selection, "bullet-to-todo").length > 0;

export const canTurnTodoSelectionToBullet = (content: string, selection: Selection) =>
  getSelectedConvertibleLineIndexes(content, selection, "todo-to-bullet").length > 0;

export const canTurnSelectionToRegular = (content: string, selection: Selection) =>
  getSelectedConvertibleLineIndexes(content, selection, "list-to-regular").length > 0;

export const canTurnSelectionToBullet = (content: string, selection: Selection) =>
  canTurnTodoSelectionToBullet(content, selection) ||
  getSelectedConvertibleLineIndexes(content, selection, "regular-to-bullet").length > 0;

export const canTurnSelectionToTodo = (content: string, selection: Selection) =>
  canTurnBulletSelectionToTodo(content, selection) ||
  getSelectedConvertibleLineIndexes(content, selection, "regular-to-todo").length > 0;

export const convertListSelection = (
  content: string,
  selection: Selection,
  conversion: ListConversion,
): ListConversionResult | null => {
  const lines = getLines(content);
  const selectedIndexes = new Set(getSelectedConvertibleLineIndexes(content, selection, conversion));

  if (selectedIndexes.size === 0) return null;

  const nextLines = lines.map((line, index) => {
    if (!selectedIndexes.has(index)) return line.text;

    if (conversion === "regular-to-bullet") return `- ${line.text}`;
    if (conversion === "regular-to-todo") return `- [ ] ${line.text}`;

    const match =
      conversion === "bullet-to-todo"
        ? line.text.match(UNORDERED_LIST_PATTERN)
        : conversion === "todo-to-bullet"
          ? line.text.match(TODO_LIST_PATTERN)
          : (line.text.match(UNORDERED_LIST_PATTERN) ?? line.text.match(TODO_LIST_PATTERN));

    if (!match) return line.text;

    if (conversion === "list-to-regular") return line.text.slice(match[0].length);

    return conversion === "bullet-to-todo"
      ? `${normalizeBulletPrefix(match[1])}[ ] ${line.text.slice(match[1].length)}`
      : `${normalizeBulletPrefix(match[1])}${line.text.slice(match[0].length)}`;
  });

  const editedContent = nextLines.join("\n");
  const syncedContent = syncTaskCookies(editedContent);

  return {
    content: syncedContent,
    selection: mapSelection(content, syncedContent, selection),
  };
};
