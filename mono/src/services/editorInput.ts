import { renumberOrderedList } from "./markdown/features/orderedList";
import { handleBackspaceAtListStart, handleEnter, handleInput } from "./markdown/input";
import { INDENT, INDENT_SIZE, insert } from "./markdown/utils";

type Selection = { start: number; end: number };
type EditResult = { content: string; cursor: number };

const EMPHASIS_DELIMITER = "*";
const INLINE_CODE_DELIMITER = "`";
const AUTO_PAIRED_DELIMITERS = [EMPHASIS_DELIMITER, INLINE_CODE_DELIMITER] as const;

const shouldExpandEmphasisToStrong = (content: string, selection: Selection, char: string) =>
  char === EMPHASIS_DELIMITER &&
  selection.start === selection.end &&
  selection.start > 0 &&
  content[selection.start - 1] === EMPHASIS_DELIMITER &&
  content[selection.start] === EMPHASIS_DELIMITER;

const getAutoPairDelimiter = (content: string, selection: Selection, char: string): string | null => {
  if (!AUTO_PAIRED_DELIMITERS.includes(char as (typeof AUTO_PAIRED_DELIMITERS)[number])) return null;
  if (selection.start !== selection.end) return null;

  const lineStart = content.lastIndexOf("\n", selection.start - 1) + 1;
  if (lineStart === 0) return null;

  const nextChar = content[selection.start];
  if (nextChar && !/\s/.test(nextChar)) return null;

  return char;
};

const createPairInsert = (content: string, start: number, end: number, delimiter: string): EditResult => ({
  content: insert(content, start, end, `${delimiter}${delimiter}`),
  cursor: start + delimiter.length,
});

const handleBackspaceAtEmptyPair = (content: string, selection: Selection, delimiter: string): EditResult | null => {
  const { start, end } = selection;
  if (start !== end || start === 0 || start >= content.length) return null;
  if (content[start - 1] !== delimiter || content[start] !== delimiter) return null;

  return {
    content: insert(content, start - 1, start + 1, ""),
    cursor: start - 1,
  };
};

const handleBackspaceAtIndent = (content: string, selection: Selection): EditResult | null => {
  const { start, end } = selection;
  if (start !== end || start < INDENT_SIZE) return null;
  if (content.slice(start - INDENT_SIZE, start) !== INDENT) return null;

  return {
    content: insert(content, start - INDENT_SIZE, start, ""),
    cursor: start - INDENT_SIZE,
  };
};

export const processBeforeInput = (
  inputType: string,
  content: string,
  selection: Selection,
  data: { eventData?: string | null; iosReplacementText?: string },
): EditResult | null => {
  const { start, end } = selection;

  switch (inputType) {
    case "insertText": {
      if (!data.eventData) return null;

      // Some custom keyboards (e.g. SwiftKey) send newline as part of the insertText event
      // when confirming an autocomplete suggestion with Enter
      if (data.eventData.endsWith("\n")) {
        const textWithoutNewline = data.eventData.slice(0, -1);
        const afterInsert = insert(content, start, end, textWithoutNewline);
        const cursorAfterInsert = start + textWithoutNewline.length;
        return handleEnter(afterInsert, {
          start: cursorAfterInsert,
          end: cursorAfterInsert,
        });
      }

      if (data.eventData === " " && start === end) {
        const result = handleInput(" ", content, selection);
        if (result) return result;
      }

      if (shouldExpandEmphasisToStrong(content, selection, data.eventData)) {
        return createPairInsert(content, start, end, EMPHASIS_DELIMITER);
      }

      const autoPairDelimiter = getAutoPairDelimiter(content, selection, data.eventData);
      if (autoPairDelimiter) {
        return createPairInsert(content, start, end, autoPairDelimiter);
      }

      return {
        content: insert(content, start, end, data.eventData),
        cursor: start + data.eventData.length,
      };
    }

    case "insertReplacementText":
      if (!data.iosReplacementText) return null;
      return {
        content: insert(content, start, end, data.iosReplacementText),
        cursor: start + data.iosReplacementText.length,
      };

    case "insertFromPaste":
      if (!data.eventData) return null;
      return {
        content: insert(content, start, end, data.eventData),
        cursor: start + data.eventData.length,
      };

    case "insertParagraph":
      return handleEnter(content, selection);

    case "deleteByCut": {
      if (end > start) {
        const afterDelete = insert(content, start, end, "");
        return renumberOrderedList(afterDelete, start);
      } else if (start > 0) {
        const afterDelete = insert(content, start - 1, start, "");
        return renumberOrderedList(afterDelete, start - 1);
      }
      return null;
    }

    case "deleteContentBackward": {
      const listResult = handleBackspaceAtListStart(content, selection);
      if (listResult) return listResult;

      for (const delimiter of AUTO_PAIRED_DELIMITERS) {
        const emptyPairResult = handleBackspaceAtEmptyPair(content, selection, delimiter);
        if (emptyPairResult) return emptyPairResult;
      }

      const indentResult = handleBackspaceAtIndent(content, selection);
      if (indentResult) return indentResult;

      if (end > start) {
        const afterDelete = insert(content, start, end, "");
        return renumberOrderedList(afterDelete, start);
      } else if (start > 0) {
        const afterDelete = insert(content, start - 1, start, "");
        return renumberOrderedList(afterDelete, start - 1);
      }
      return null;
    }

    case "deleteSoftLineBackward": {
      const lineStart = content.lastIndexOf("\n", start - 1) + 1;
      const deleteLength = start - lineStart;
      if (deleteLength > 0) {
        const afterDelete = insert(content, lineStart, start, "");
        return renumberOrderedList(afterDelete, lineStart);
      }
      return null;
    }

    case "deleteWordBackward": {
      const beforeCursor = content.slice(0, start);
      const wordMatch = beforeCursor.match(/\S+\s*$/);
      if (wordMatch) {
        const deleteLength = wordMatch[0].length;
        const afterDelete = insert(content, start - deleteLength, start, "");
        return renumberOrderedList(afterDelete, start - deleteLength);
      }
      return null;
    }

    default:
      return null;
  }
};
