import { getLineRange } from "../services/markdown/utils";
import type { NoteActionContext, NoteActionResult } from "./types";

export type HeadingLevel = 1 | 2 | 3;

const HEADING_PATTERN = /^(#{1,3})\s/;

export const getHeadingLevelAtSelection = ({ content, selection }: NoteActionContext): HeadingLevel | null => {
  const line = getLineRange(content, selection.start).line;
  const match = line.match(HEADING_PATTERN);
  if (!match) return null;

  return match[1].length as HeadingLevel;
};

export const setHeadingLevelAtSelection = (context: NoteActionContext, level: HeadingLevel): NoteActionResult => {
  const { content, selection } = context;
  const lineRange = getLineRange(content, selection.start);
  const match = lineRange.line.match(HEADING_PATTERN);
  const prefix = `${"#".repeat(level)} `;
  const nextLine = match ? `${prefix}${lineRange.line.slice(match[0].length)}` : `${prefix}${lineRange.line}`;
  const nextContent = `${content.slice(0, lineRange.start)}${nextLine}${content.slice(lineRange.end)}`;
  const selectionOffset = nextLine.length - lineRange.line.length;

  return {
    content: nextContent,
    selection: {
      start: selection.start + selectionOffset,
      end: selection.end + selectionOffset,
    },
  };
};
