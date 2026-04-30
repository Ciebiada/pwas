import { getLineRange } from "../markdown/utils";
import { createPairInsert, handleBackspaceAtEmptyPair, isAutoPairPosition } from "./helpers";
import type { EditorInputRule, EditorInputRuleContext } from "./types";

const INLINE_CODE_DELIMITER = "`";
const FENCED_CODE_BLOCK_DELIMITER = "```";

const createFencedCodeBlockInsert = ({ content, selection }: EditorInputRuleContext) => {
  const { start, end } = selection;
  if (start !== end) return null;

  const { start: lineStart, end: lineEnd, line } = getLineRange(content, start);
  const cursorInLine = start - lineStart;

  if (lineStart === 0 || line !== `${INLINE_CODE_DELIMITER}${INLINE_CODE_DELIMITER}` || cursorInLine !== 1) {
    return null;
  }

  return {
    content: `${content.slice(0, lineStart)}${FENCED_CODE_BLOCK_DELIMITER}\n\n${FENCED_CODE_BLOCK_DELIMITER}${content.slice(lineEnd)}`,
    cursor: lineStart + FENCED_CODE_BLOCK_DELIMITER.length + 1,
  };
};

export const inlineCodeInputRule: EditorInputRule = {
  name: "inlineCode",

  onInsertText(text, context) {
    if (text !== INLINE_CODE_DELIMITER) return null;

    const fencedCodeBlockResult = createFencedCodeBlockInsert(context);
    if (fencedCodeBlockResult) return fencedCodeBlockResult;

    return isAutoPairPosition(context.content, context.selection)
      ? createPairInsert(context.content, context.selection, INLINE_CODE_DELIMITER)
      : null;
  },

  onDeleteContentBackward({ content, selection }) {
    return handleBackspaceAtEmptyPair(content, selection, INLINE_CODE_DELIMITER);
  },
};
