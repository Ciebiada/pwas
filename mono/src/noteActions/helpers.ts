import { calculateCursorPosition } from "../services/cursor";
import type { Selection } from "../services/markdown/utils";
import type { NoteActionContext, NoteActionResult } from "./types";

export const wrapSelection = (
  { content, selection }: NoteActionContext,
  prefix: string,
  suffix = prefix,
): NoteActionResult => ({
  content: `${content.slice(0, selection.start)}${prefix}${content.slice(selection.start, selection.end)}${suffix}${content.slice(selection.end)}`,
  selection: {
    start: selection.start + prefix.length,
    end: selection.end + prefix.length,
  },
});

export const insertPairAtCursor = ({ content, selection }: NoteActionContext, delimiter: string): NoteActionResult => ({
  content: `${content.slice(0, selection.start)}${delimiter}${delimiter}${content.slice(selection.end)}`,
  selection: {
    start: selection.start + delimiter.length,
    end: selection.start + delimiter.length,
  },
});

export const createCollapsedSelection = (content: string, nextContent: string, cursor: number): Selection => {
  const nextCursor = calculateCursorPosition(content, nextContent, cursor);
  return {
    start: nextCursor,
    end: nextCursor,
  };
};
