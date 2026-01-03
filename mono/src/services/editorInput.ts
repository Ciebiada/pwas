import {
  handleBackspaceAtListStart,
  handleEnter,
  handleInput,
  handleTab,
} from "./markdown/input";
import { insert } from "./markdown/utils";
import { renumberOrderedList } from "./markdown/features/orderedList";

type Selection = { start: number; end: number };
type EditResult = { content: string; cursor: number };

export const processTab = (
  content: string,
  selection: Selection,
  shiftKey: boolean,
): EditResult => handleTab(content, selection, shiftKey);

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
