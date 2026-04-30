import { type InputResult, insert, type Selection } from "../markdown/utils";

export const createPairInsert = (content: string, selection: Selection, delimiter: string): InputResult => ({
  content: insert(content, selection.start, selection.end, `${delimiter}${delimiter}`),
  cursor: selection.start + delimiter.length,
});

export const isAutoPairPosition = (content: string, selection: Selection) => {
  if (selection.start !== selection.end) return false;

  const lineStart = content.lastIndexOf("\n", selection.start - 1) + 1;
  if (lineStart === 0) return false;

  const nextChar = content[selection.start];
  return !nextChar || /\s/.test(nextChar);
};

export const handleBackspaceAtEmptyPair = (
  content: string,
  selection: Selection,
  delimiter: string,
): InputResult | null => {
  const { start, end } = selection;
  if (start !== end || start === 0 || start >= content.length) return null;
  if (content[start - 1] !== delimiter || content[start] !== delimiter) return null;

  return {
    content: insert(content, start - 1, start + 1, ""),
    cursor: start - 1,
  };
};
