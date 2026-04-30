import { insert } from "../markdown/utils";
import {
  createPairInsert,
  handleBackspaceAtEmptyPair,
  handleOvertypeClosingDelimiter,
  isAutoPairPosition,
} from "./helpers";
import type { EditorInputRule } from "./types";

const EMPHASIS_DELIMITER = "*";
const STRONG_DELIMITER = "**";
const STRIKETHROUGH_DELIMITER = "~";
const STRIKETHROUGH_PAIR_DELIMITER = "~~";

const shouldExpandEmphasisToStrong = (content: string, selection: { start: number; end: number }, text: string) =>
  text === EMPHASIS_DELIMITER &&
  selection.start === selection.end &&
  selection.start > 0 &&
  content[selection.start - 1] === EMPHASIS_DELIMITER &&
  content[selection.start] === EMPHASIS_DELIMITER;

const shouldCreateStrikethroughPair = (content: string, selection: { start: number; end: number }, text: string) => {
  if (text !== STRIKETHROUGH_DELIMITER || selection.start !== selection.end || selection.start === 0) return false;
  if (content[selection.start - 1] !== STRIKETHROUGH_DELIMITER) return false;

  const nextChar = content[selection.start];
  return !nextChar || /\s/.test(nextChar);
};

export const inlineFormattingInputRule: EditorInputRule = {
  name: "inlineFormatting",

  onInsertText(text, { content, selection }) {
    for (const delimiter of [STRONG_DELIMITER, EMPHASIS_DELIMITER, STRIKETHROUGH_PAIR_DELIMITER]) {
      const overtypeResult = handleOvertypeClosingDelimiter(content, selection, text, delimiter);
      if (overtypeResult) return overtypeResult;
    }

    if (shouldExpandEmphasisToStrong(content, selection, text)) {
      return createPairInsert(content, selection, EMPHASIS_DELIMITER);
    }

    if (shouldCreateStrikethroughPair(content, selection, text)) {
      return {
        content: insert(content, selection.start - 1, selection.end, "~~~~"),
        cursor: selection.start + 1,
      };
    }

    if (text === EMPHASIS_DELIMITER && isAutoPairPosition(content, selection)) {
      return createPairInsert(content, selection, EMPHASIS_DELIMITER);
    }

    return null;
  },

  onDeleteContentBackward({ content, selection }) {
    return handleBackspaceAtEmptyPair(content, selection, EMPHASIS_DELIMITER);
  },
};
