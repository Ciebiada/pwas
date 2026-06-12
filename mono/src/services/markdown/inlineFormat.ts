export type MarkdownInlineFormatType = "strong" | "emphasis" | "strikethrough";

const INLINE_FORMATS: Array<{ type: MarkdownInlineFormatType; delimiter: string }> = [
  { type: "strong", delimiter: "**" },
  { type: "strong", delimiter: "__" },
  { type: "strikethrough", delimiter: "~~" },
  { type: "emphasis", delimiter: "*" },
  { type: "emphasis", delimiter: "_" },
];

const isWordCharacter = (character: string | undefined) => character !== undefined && /[\p{L}\p{N}_]/u.test(character);

const isDelimiterRunStart = (text: string, index: number, delimiter: string) => text[index - 1] !== delimiter[0];

const canOpen = (text: string, index: number, delimiter: string) =>
  delimiter[0] !== "_" || !isWordCharacter(text[index - 1]);

const canClose = (text: string, index: number, delimiter: string) =>
  delimiter[0] !== "_" || !isWordCharacter(text[index + delimiter.length]);

const hasFormattedContent = (content: string) => content.length > 0 && !/^\s|\s$/u.test(content);

const findClosingDelimiter = (text: string, start: number, delimiter: string) => {
  const lineEnd = text.indexOf("\n", start);
  const searchEnd = lineEnd === -1 ? text.length : lineEnd;

  for (
    let index = text.indexOf(delimiter, start);
    index !== -1 && index < searchEnd;
    index = text.indexOf(delimiter, index + 1)
  ) {
    if (isDelimiterRunStart(text, index, delimiter) && canClose(text, index, delimiter)) return index;
  }

  return -1;
};

export const matchInlineFormatAt = (text: string, index: number) => {
  for (const format of INLINE_FORMATS) {
    const { delimiter } = format;
    if (!text.startsWith(delimiter, index)) continue;

    if (delimiter === "~~") {
      const match = text.slice(index).match(/^~~(\S(?:[^\n]*?\S)?)~~/);
      if (!match) return null;

      return {
        type: format.type,
        delimiter,
        content: match[1],
        raw: match[0],
        contentStart: index + delimiter.length,
        contentEnd: index + match[0].length - delimiter.length,
      };
    }

    if (!isDelimiterRunStart(text, index, delimiter) || !canOpen(text, index, delimiter)) continue;

    const contentStart = index + delimiter.length;
    const delimiterEnd = findClosingDelimiter(text, contentStart, delimiter);
    if (delimiterEnd === -1) continue;

    const content = text.slice(contentStart, delimiterEnd);
    if (!hasFormattedContent(content)) continue;

    const rawEnd = delimiterEnd + delimiter.length;
    return {
      type: format.type,
      delimiter,
      content,
      raw: text.slice(index, rawEnd),
      contentStart,
      contentEnd: delimiterEnd,
    };
  }

  return null;
};

export const matchInlineCodeAt = (text: string, index: number) => {
  if (text[index] !== "`") return null;
  const lineEnd = text.indexOf("\n", index + 1);
  const searchEnd = lineEnd === -1 ? text.length : lineEnd;
  const closeIndex = text.indexOf("`", index + 1);
  if (closeIndex === -1 || closeIndex >= searchEnd || closeIndex === index + 1) return null;
  return {
    raw: text.slice(index, closeIndex + 1),
    contentStart: index + 1,
    contentEnd: closeIndex,
  };
};
