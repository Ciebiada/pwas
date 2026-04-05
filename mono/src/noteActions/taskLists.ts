import { createCollapsedSelection } from "./helpers";
import type { NoteActionContext, NoteActionResult } from "./types";

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

const TASK_LIST_ITEM_PATTERN = /^(\s*[-*] )\[([ x])\]\s/;

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

const isTaskListItem = (line: string) => TASK_LIST_ITEM_PATTERN.test(line);

const isCheckedTaskListItem = (line: string) => TASK_LIST_ITEM_PATTERN.exec(line)?.[2] === "x";

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

export const removeCheckedTasksFromCurrentList = ({
  content,
  selection,
}: NoteActionContext): NoteActionResult | null => {
  const taskListRange = getTaskListRange(content, selection.start);
  if (!taskListRange) return null;

  const nextContent = taskListRange.lines
    .filter((line, index) => {
      const isInsideTaskList = index >= taskListRange.start && index <= taskListRange.end;
      return !isInsideTaskList || !isCheckedTaskListItem(line.text);
    })
    .map((line) => line.text)
    .join("\n");

  if (nextContent === content) return null;

  return {
    content: nextContent,
    selection: createCollapsedSelection(content, nextContent, selection.start),
  };
};
