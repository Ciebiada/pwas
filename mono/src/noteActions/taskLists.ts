import { type Selection, TODO_LIST_PATTERN } from "../services/markdown/utils";
import type { NoteActionContext, NoteActionResult } from "./types";

type SurvivingLine = {
  lineIndex: number;
  text: string;
  newStart: number;
};

type ContentLine = {
  text: string;
  start: number;
  end: number;
};

type TaskListRange = {
  lines: ContentLine[];
  start: number;
  end: number;
};

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

const isTaskListItem = (line: string) => TODO_LIST_PATTERN.test(line);

const isCheckedTaskListItem = (line: string) => TODO_LIST_PATTERN.exec(line)?.[2] === "x";

const getTaskListRange = (content: string, cursor: number): TaskListRange | null => {
  const lines = getLines(content);
  const currentLineIndex = getLineIndexAtPosition(lines, cursor);

  if (!isTaskListItem(lines[currentLineIndex]?.text ?? "")) return null;

  let start = currentLineIndex;
  let end = currentLineIndex;

  while (start > 0 && isTaskListItem(lines[start - 1].text)) start -= 1;
  while (end < lines.length - 1 && isTaskListItem(lines[end + 1].text)) end += 1;

  return {
    lines,
    start,
    end,
  };
};

export const hasCheckedTasksInCurrentList = ({ content, selection }: NoteActionContext) => {
  const taskListRange = getTaskListRange(content, selection.start);
  if (!taskListRange) return false;

  return taskListRange.lines
    .slice(taskListRange.start, taskListRange.end + 1)
    .some((line) => isCheckedTaskListItem(line.text));
};

// After removing checked tasks, place the caret where the user can keep typing or
// press Enter: keep the column when the caret's own line survived, otherwise move
// to the end of the nearest surviving item in the same list — the next one, or
// the previous one when the last item was removed.
const collapsedSelectionAfterRemoval = (
  survivors: SurvivingLine[],
  lines: ContentLine[],
  range: TaskListRange,
  cursor: number,
): Selection => {
  const cursorLineIndex = getLineIndexAtPosition(lines, cursor);
  const cursorLine = survivors.find((survivor) => survivor.lineIndex === cursorLineIndex);

  const position = cursorLine
    ? cursorLine.newStart + Math.min(cursor - lines[cursorLineIndex].start, cursorLine.text.length)
    : endOfNearestSurvivingItem(survivors, range, cursorLineIndex);

  return { start: position, end: position };
};

const endOfNearestSurvivingItem = (survivors: SurvivingLine[], range: TaskListRange, removedLineIndex: number) => {
  const isInList = (index: number) => index >= range.start && index <= range.end;
  const target =
    survivors.find((survivor) => survivor.lineIndex > removedLineIndex && isInList(survivor.lineIndex)) ??
    survivors.findLast((survivor) => survivor.lineIndex < removedLineIndex && isInList(survivor.lineIndex)) ??
    survivors.findLast((survivor) => survivor.lineIndex < removedLineIndex) ??
    survivors.find((survivor) => survivor.lineIndex > removedLineIndex);

  return target ? target.newStart + target.text.length : 0;
};

export const removeCheckedTasksFromCurrentList = ({
  content,
  selection,
}: NoteActionContext): NoteActionResult | null => {
  const taskListRange = getTaskListRange(content, selection.start);
  if (!taskListRange) return null;

  const { lines, start, end } = taskListRange;
  const isRemoved = (index: number) => index >= start && index <= end && isCheckedTaskListItem(lines[index].text);

  const survivors: SurvivingLine[] = [];
  let newStart = 0;
  for (const [index, line] of lines.entries()) {
    if (isRemoved(index)) continue;
    survivors.push({ lineIndex: index, text: line.text, newStart });
    newStart += line.text.length + 1;
  }

  const nextContent = survivors.map((survivor) => survivor.text).join("\n");
  if (nextContent === content) return null;

  return {
    content: nextContent,
    selection: collapsedSelectionAfterRemoval(survivors, lines, taskListRange, selection.start),
  };
};
