import { EDITOR_INPUT_RULES } from "./editorInputRules";
import { renumberOrderedList } from "./markdown/features/orderedList";
import { handleBackspaceAtListStart, handleEnter, handleInput } from "./markdown/input";
import { INDENT, INDENT_SIZE, type InputResult, insert, type Selection } from "./markdown/utils";

const handleBackspaceAtIndent = (content: string, selection: Selection): InputResult | null => {
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
): InputResult | null => {
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

      for (const rule of EDITOR_INPUT_RULES) {
        const result = rule.onInsertText?.(data.eventData, { content, selection });
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

      for (const rule of EDITOR_INPUT_RULES) {
        const result = rule.onDeleteContentBackward?.({ content, selection });
        if (result) return result;
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
