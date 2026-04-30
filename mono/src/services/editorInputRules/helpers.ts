import { getLineRange, type InputResult, insert, type Selection } from "../markdown/utils";

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

export const handleOvertypeClosingDelimiter = (
  content: string,
  selection: Selection,
  text: string,
  delimiter: string,
): InputResult | null => {
  const { start, end } = selection;
  if (start !== end || text.length === 0 || text.length > delimiter.length) return null;
  if (!delimiter.startsWith(text)) return null;

  const { start: lineStart, line } = getLineRange(content, start);
  const cursorInLine = start - lineStart;
  const candidates: Array<{ delimiterStart: number; cursor: number }> = [];

  const isClosingDelimiter = (delimiterStart: number) => {
    let occurrenceIndex = -1;
    for (let index = line.indexOf(delimiter); index !== -1; index = line.indexOf(delimiter, index + delimiter.length)) {
      occurrenceIndex++;
      if (index === delimiterStart) return occurrenceIndex % 2 === 1;
    }

    return false;
  };

  if (cursorInLine >= delimiter.length && line.slice(cursorInLine - delimiter.length, cursorInLine) === delimiter) {
    candidates.push({ delimiterStart: cursorInLine - delimiter.length, cursor: start });
  }

  if (content.startsWith(text, start)) {
    for (
      let delimiterStart = cursorInLine - delimiter.length + text.length;
      delimiterStart <= cursorInLine;
      delimiterStart++
    ) {
      if (delimiterStart < 0 || line.slice(delimiterStart, delimiterStart + delimiter.length) !== delimiter) continue;
      if (cursorInLine + text.length > delimiterStart + delimiter.length) continue;

      candidates.push({ delimiterStart, cursor: start + text.length });
    }
  }

  const candidate = candidates[0];
  if (candidate) return isClosingDelimiter(candidate.delimiterStart) ? { content, cursor: candidate.cursor } : null;

  return null;
};
