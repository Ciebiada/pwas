import { wrapSelection } from "./helpers";
import type { NoteActionContext, NoteActionResult } from "./types";

export type InlineFormatType = "strong" | "emphasis";

export type InlineFormat = {
  type: InlineFormatType;
  delimiter: string;
};

type InlineFormatToken = {
  type: InlineFormatType;
  delimiter: string;
  contentStart: number;
  contentEnd: number;
};

const INLINE_FORMAT_PATTERNS: Array<InlineFormat & { regex: RegExp }> = [
  { type: "strong", delimiter: "**", regex: /^\*\*(\S(?:.*?\S)?)\*\*/ },
  { type: "strong", delimiter: "__", regex: /^__(\S(?:.*?\S)?)__/ },
  { type: "emphasis", delimiter: "*", regex: /^\*(\S(?:.*?\S)?)\*/ },
  { type: "emphasis", delimiter: "_", regex: /^_(?!_)([^_]+)_/ },
];

export const normalizeInlineFormatContext = (context: NoteActionContext): NoteActionContext => {
  let { end } = context.selection;

  while (end > context.selection.start && context.content[end - 1] === "\n") {
    end -= 1;
  }

  return end === context.selection.end
    ? context
    : {
        ...context,
        selection: {
          start: context.selection.start,
          end,
        },
      };
};

const findEnclosingInlineFormat = ({ content, selection }: NoteActionContext) => {
  let index = 0;

  while (index < content.length) {
    const slice = content.slice(index);
    const matchedPattern = INLINE_FORMAT_PATTERNS.find(({ regex }) => regex.test(slice));

    if (!matchedPattern) {
      index += 1;
      continue;
    }

    const match = slice.match(matchedPattern.regex);
    if (!match) {
      index += 1;
      continue;
    }

    const fullMatch = match[0];
    const token: InlineFormatToken = {
      type: matchedPattern.type,
      delimiter: matchedPattern.delimiter,
      contentStart: index + matchedPattern.delimiter.length,
      contentEnd: index + fullMatch.length - matchedPattern.delimiter.length,
    };

    if (selection.start >= token.contentStart && selection.end <= token.contentEnd) {
      return token;
    }

    index += fullMatch.length;
  }

  return null;
};

const unwrapEnclosingInlineFormat = (context: NoteActionContext, token: InlineFormatToken): NoteActionContext => ({
  ...context,
  content: `${context.content.slice(0, token.contentStart - token.delimiter.length)}${context.content.slice(token.contentStart, token.contentEnd)}${context.content.slice(token.contentEnd + token.delimiter.length)}`,
  selection: {
    start: context.selection.start - token.delimiter.length,
    end: context.selection.end - token.delimiter.length,
  },
});

export const selectionHasInlineFormat = (context: NoteActionContext, type: InlineFormatType) => {
  const normalizedContext = normalizeInlineFormatContext(context);
  const token = findEnclosingInlineFormat(normalizedContext);
  if (!token || token.type !== type) return false;

  return (
    normalizedContext.selection.start === token.contentStart && normalizedContext.selection.end === token.contentEnd
  );
};

export const applyInlineFormatAction = (context: NoteActionContext, format: InlineFormat): NoteActionResult => {
  const normalizedContext = normalizeInlineFormatContext(context);
  const enclosingFormat = findEnclosingInlineFormat(normalizedContext);

  if (!enclosingFormat) {
    return wrapSelection(normalizedContext, format.delimiter);
  }

  const unwrappedContext = unwrapEnclosingInlineFormat(normalizedContext, enclosingFormat);

  if (
    enclosingFormat.type === format.type &&
    normalizedContext.selection.start === enclosingFormat.contentStart &&
    normalizedContext.selection.end === enclosingFormat.contentEnd
  ) {
    return {
      content: unwrappedContext.content,
      selection: unwrappedContext.selection,
    };
  }

  return wrapSelection(unwrappedContext, format.delimiter);
};
