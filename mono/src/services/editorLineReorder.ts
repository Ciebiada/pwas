export type CursorSelection = {
  start: number;
  end: number;
};

export type LineRange = {
  startLineIndex: number;
  endLineIndex: number;
};

export type LineReorderEdit = {
  content: string;
  selection: CursorSelection;
};

export const isLineDropMove = (range: LineRange, dropIndex: number) =>
  dropIndex < range.startLineIndex || dropIndex > range.endLineIndex + 1;

const getLinePosition = (lines: string[], offset: number) => {
  let lineStart = 0;
  const clampedOffset = Math.max(0, offset);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineEnd = lineStart + lines[lineIndex].length;
    if (clampedOffset <= lineEnd) {
      return {
        column: clampedOffset - lineStart,
        lineIndex,
      };
    }
    lineStart = lineEnd + 1;
  }

  return {
    column: lines.at(-1)?.length ?? 0,
    lineIndex: Math.max(0, lines.length - 1),
  };
};

const getOffsetAtLinePosition = (lines: string[], lineIndex: number, column: number) => {
  const clampedLineIndex = Math.max(0, Math.min(lineIndex, lines.length - 1));
  let offset = 0;

  for (let index = 0; index < clampedLineIndex; index += 1) {
    offset += lines[index].length + 1;
  }

  return offset + Math.min(column, lines[clampedLineIndex].length);
};

const mapLineIndexAfterMove = (lineIndex: number, range: LineRange, dropIndex: number, movedStartLineIndex: number) => {
  const blockLength = range.endLineIndex - range.startLineIndex + 1;

  if (lineIndex >= range.startLineIndex && lineIndex <= range.endLineIndex) {
    return movedStartLineIndex + lineIndex - range.startLineIndex;
  }

  if (dropIndex < range.startLineIndex && lineIndex >= dropIndex && lineIndex < range.startLineIndex) {
    return lineIndex + blockLength;
  }

  if (dropIndex > range.endLineIndex + 1 && lineIndex > range.endLineIndex && lineIndex < dropIndex) {
    return lineIndex - blockLength;
  }

  return lineIndex;
};

export const moveLineRange = (
  value: string,
  range: LineRange,
  dropIndex: number,
  cursor: number,
): LineReorderEdit | null => {
  const lines = value.split("\n");
  const startLineIndex = Math.max(0, Math.min(range.startLineIndex, lines.length - 1));
  const endLineIndex = Math.max(startLineIndex, Math.min(range.endLineIndex, lines.length - 1));
  const clampedDropIndex = Math.max(0, Math.min(dropIndex, lines.length));

  if (clampedDropIndex >= startLineIndex && clampedDropIndex <= endLineIndex + 1) return null;

  const blockLength = endLineIndex - startLineIndex + 1;
  const movedLines = lines.slice(startLineIndex, endLineIndex + 1);
  const remainingLines = [...lines.slice(0, startLineIndex), ...lines.slice(endLineIndex + 1)];
  const movedStartLineIndex = clampedDropIndex > startLineIndex ? clampedDropIndex - blockLength : clampedDropIndex;
  const nextLines = [
    ...remainingLines.slice(0, movedStartLineIndex),
    ...movedLines,
    ...remainingLines.slice(movedStartLineIndex),
  ];
  const previousPosition = getLinePosition(lines, Math.min(cursor, value.length));
  const nextCursor = getOffsetAtLinePosition(
    nextLines,
    mapLineIndexAfterMove(
      previousPosition.lineIndex,
      { startLineIndex, endLineIndex },
      clampedDropIndex,
      movedStartLineIndex,
    ),
    previousPosition.column,
  );

  return {
    content: nextLines.join("\n"),
    selection: {
      start: nextCursor,
      end: nextCursor,
    },
  };
};
