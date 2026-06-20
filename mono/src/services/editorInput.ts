import { EDITOR_INPUT_RULES } from "./editorInputRules";
import { renumberOrderedList } from "./markdown/features/orderedList";
import { matchInlineCodeAt, matchInlineFormatAt } from "./markdown/inlineFormat";
import { handleBackspaceAtListStart, handleEnter, handleInput } from "./markdown/input";
import { tokenizeLines } from "./markdown/tokenize";
import { INDENT, INDENT_SIZE, type InputResult, insert, type Selection } from "./markdown/utils";

interface InlineFormatTokenSpan {
  start: number;
  contentStart: number;
  contentEnd: number;
  end: number;
}

const findAllInlineFormatTokens = (text: string): InlineFormatTokenSpan[] => {
  const tokens: InlineFormatTokenSpan[] = [];
  const triggerChars = new Set(["`", "*", "_", "~"]);
  let pos = 0;

  for (const line of tokenizeLines(text)) {
    const lineStart = pos;
    const lineEnd = pos + line.prefix.length + line.content.length;
    pos = lineEnd + 1;
    if (line.disableInlineMarkdown) continue;

    for (let i = lineStart; i < lineEnd; i++) {
      if (!triggerChars.has(text[i])) continue;

      const match = matchInlineCodeAt(text, i) ?? matchInlineFormatAt(text, i);
      if (!match) continue;

      tokens.push({
        start: i,
        contentStart: match.contentStart,
        contentEnd: match.contentEnd,
        end: i + match.raw.length,
      });
      i += match.raw.length - 1;
    }
  }

  return tokens;
};

const handleSelectionWithFormatCleanup = (
  content: string,
  start: number,
  end: number,
  insertText = "",
): { content: string; cursor: number } => {
  const intersecting = findAllInlineFormatTokens(content).filter((t) => t.contentStart < end && t.contentEnd > start);
  const first = intersecting[0];
  const last = intersecting[intersecting.length - 1];

  let before = content.slice(0, start);
  if (first && first.start < start) {
    before = content.slice(0, first.start) + content.slice(first.contentStart, start);
  }

  let after = content.slice(end);
  if (last && last.end > end) {
    after = content.slice(end, last.contentEnd) + content.slice(last.end);
  }

  return { content: before + insertText + after, cursor: before.length + insertText.length };
};

// When a selection exactly covers the text of a line that has a block prefix
// (`# ` heading, `- `/`* ` list, `1. ` ordered, `- [ ] ` checkbox), deleting it
// should clear the whole line by also removing the prefix — otherwise selecting
// the rendered line and pressing backspace leaves a dangling marker behind. The
// prefix is whatever the per-line tokenizer strips off as `prefix`.
const expandSelectionOverLinePrefix = (content: string, start: number, end: number): number => {
  let lineStart = 0;
  for (const line of tokenizeLines(content)) {
    const contentStart = lineStart + line.prefix.length;
    const contentEnd = contentStart + line.content.length;
    if (line.prefix.length > 0 && start === contentStart && end === contentEnd) {
      return lineStart;
    }
    lineStart = contentEnd + 1;
  }
  return start;
};

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

  // Replace the selection with `text`, stripping the delimiters of any inline
  // format whose content the selection cuts into (e.g. deleting inside **bold**).
  const replaceSelection = (text: string): InputResult =>
    end > start
      ? handleSelectionWithFormatCleanup(content, start, end, text)
      : { content: insert(content, start, end, text), cursor: start + text.length };

  const deleteSelection = (): InputResult => {
    const deleteStart = expandSelectionOverLinePrefix(content, start, end);
    const cleaned = handleSelectionWithFormatCleanup(content, deleteStart, end);
    return renumberOrderedList(cleaned.content, cleaned.cursor);
  };

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

      return replaceSelection(data.eventData);
    }

    case "insertReplacementText":
      if (!data.iosReplacementText) return null;
      return replaceSelection(data.iosReplacementText);

    case "insertFromPaste":
      if (!data.eventData) return null;
      return replaceSelection(data.eventData);

    case "insertParagraph":
      return handleEnter(content, selection);

    case "deleteByCut": {
      if (end > start) {
        return deleteSelection();
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
        return deleteSelection();
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
