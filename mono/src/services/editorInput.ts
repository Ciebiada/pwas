import {
  handleBackspaceAtListStart,
  handleEnter,
  handleTab,
  INDENT,
  renumberOrderedList,
} from "./markdownInput";

type Selection = { start: number; end: number };
type EditResult = { content: string; cursor: number };

const SIMPLE_SHORTCUTS: Record<string, string> = {
  "[]": "- [ ] ",
  x: "- [ ] ",
  X: "- [ ] ",
  "*": "* ",
  "-": "- ",
  "1.": "1. ",
};

type PatternShortcut = {
  pattern: RegExp;
  replace: (match: RegExpMatchArray) => string;
};

const PATTERN_SHORTCUTS: PatternShortcut[] = [
  { pattern: /^(\s*)[-*] [-*]$/, replace: (m) => m[1] + INDENT + "- " },
  { pattern: /^(\s*)[-*] \[\]$/, replace: (m) => m[1] + "- [ ] " },
  { pattern: /^(\s*)[-*] [xX]$/, replace: (m) => m[1] + "- [ ] " },
  { pattern: /^(\s*)[-*] \[[ x]\] [-*]$/, replace: (m) => m[1] + "- " },
  {
    pattern: /^(\s*)[-*] \[[ x]\] \[\]$/,
    replace: (m) => m[1] + INDENT + "- [ ] ",
  },
  {
    pattern: /^(\s*)[-*] \[[ x]\] [xX]$/,
    replace: (m) => m[1] + INDENT + "- [ ] ",
  },
  // Convert Bullet/Checkbox -> Ordered
  { pattern: /^(\s*)[-*] 1\.$/, replace: (m) => m[1] + "1. " },
  { pattern: /^(\s*)[-*] \[[ x]\] 1\.$/, replace: (m) => m[1] + "1. " },

  // Convert Ordered -> Bullet
  { pattern: /^(\s*)\d+\. [-*]$/, replace: (m) => m[1] + "- " },

  // Convert Ordered -> Checkbox
  { pattern: /^(\s*)\d+\. \[\]$/, replace: (m) => m[1] + "- [ ] " },
  { pattern: /^(\s*)\d+\. [xX]$/, replace: (m) => m[1] + "- [ ] " },

  // Indent Ordered (1. 1. -> indent 1.)
  { pattern: /^(\s*)\d+\. 1\.$/, replace: (m) => m[1] + INDENT + "1. " },
];

const insert = (content: string, start: number, end: number, text: string) =>
  content.slice(0, start) + text + content.slice(end);

const tryExpandShortcut = (
  content: string,
  cursor: number,
): EditResult | null => {
  const lineStart = content.lastIndexOf("\n", cursor - 1) + 1;
  const linePrefix = content.slice(lineStart, cursor);

  // Try simple shortcuts first (exact match, no indentation)
  const simpleReplacement = SIMPLE_SHORTCUTS[linePrefix];
  if (simpleReplacement) {
    return {
      content: insert(content, lineStart, cursor, simpleReplacement),
      cursor: lineStart + simpleReplacement.length,
    };
  }

  for (const { pattern, replace } of PATTERN_SHORTCUTS) {
    const match = linePrefix.match(pattern);
    if (match) {
      const replacement = replace(match);
      return {
        content: insert(content, lineStart, cursor, replacement),
        cursor: lineStart + replacement.length,
      };
    }
  }

  return null;
};

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
        const expanded = tryExpandShortcut(content, start);
        if (expanded) {
          return renumberOrderedList(expanded.content, expanded.cursor);
        }
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
