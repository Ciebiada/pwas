import { insert } from "../markdown/utils";
import { createPairInsert, handleBackspaceAtEmptyPair, handleOvertypeClosingDelimiter } from "./helpers";
import type { EditorInputRule } from "./types";

const EMPHASIS_DELIMITERS = ["*", "_"];
const OVERTYPE_DELIMITERS = ["**", "__", "*", "_", "~~"];
const STRIKETHROUGH_DELIMITER = "~";

const shouldExpandEmphasisToStrong = (
  content: string,
  selection: { start: number; end: number },
  text: string,
  delimiter: string,
) =>
  text === delimiter &&
  selection.start === selection.end &&
  selection.start > 0 &&
  content[selection.start - 1] === delimiter[0] &&
  content[selection.start] === delimiter;

const isFormattingAutoPairPosition = (content: string, selection: { start: number; end: number }) => {
  if (selection.start !== selection.end) return false;

  const lineStart = content.lastIndexOf("\n", selection.start - 1) + 1;
  if (lineStart === 0) return false;

  const previousChar = content[selection.start - 1];
  const nextChar = content[selection.start];
  const isSeparateWordStart = selection.start === lineStart || /\s/.test(previousChar);

  return isSeparateWordStart && (!nextChar || /\s/.test(nextChar));
};

const shouldCreateStrikethroughPair = (content: string, selection: { start: number; end: number }, text: string) => {
  if (text !== STRIKETHROUGH_DELIMITER || selection.start !== selection.end || selection.start === 0) return false;
  if (content[selection.start - 1] !== STRIKETHROUGH_DELIMITER) return false;

  const nextChar = content[selection.start];
  return !nextChar || /\s/.test(nextChar);
};

export const inlineFormattingInputRule: EditorInputRule = {
  name: "inlineFormatting",

  onInsertText(text, { content, selection }) {
    for (const delimiter of OVERTYPE_DELIMITERS) {
      if (delimiter.length === 1 && !content.startsWith(text, selection.start)) continue;

      const overtypeResult = handleOvertypeClosingDelimiter(content, selection, text, delimiter);
      if (overtypeResult) return overtypeResult;
    }

    for (const delimiter of EMPHASIS_DELIMITERS) {
      if (shouldExpandEmphasisToStrong(content, selection, text, delimiter)) {
        return createPairInsert(content, selection, delimiter);
      }
    }

    if (shouldCreateStrikethroughPair(content, selection, text)) {
      return {
        content: insert(content, selection.start - 1, selection.end, "~~~~"),
        cursor: selection.start + 1,
      };
    }

    if (EMPHASIS_DELIMITERS.includes(text) && isFormattingAutoPairPosition(content, selection)) {
      return createPairInsert(content, selection, text);
    }

    return null;
  },

  onDeleteContentBackward({ content, selection }) {
    for (const delimiter of EMPHASIS_DELIMITERS) {
      const result = handleBackspaceAtEmptyPair(content, selection, delimiter);
      if (result) return result;
    }

    return null;
  },
};
