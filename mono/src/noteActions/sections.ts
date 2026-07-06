import { HEADING_PATTERN } from "./headings";

export const getSectionRange = (content: string, position: number): { start: number; end: number } | null => {
  // Scan back from position to find the nearest heading
  let pos = position;
  while (pos >= 0) {
    const lineStart = content.lastIndexOf("\n", pos - 1) + 1;
    const lineEnd = content.indexOf("\n", lineStart);
    const line = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd);
    const match = line.match(HEADING_PATTERN);
    if (match) {
      const level = match[1].length;
      // Scan forward from this heading to find next heading at same or higher level
      let searchPos = lineEnd === -1 ? content.length : lineEnd + 1;
      while (searchPos < content.length) {
        const nextLineStart = searchPos;
        const nextLineEnd = content.indexOf("\n", nextLineStart);
        const nextLine = content.slice(nextLineStart, nextLineEnd === -1 ? content.length : nextLineEnd);
        const nextMatch = nextLine.match(HEADING_PATTERN);
        if (nextMatch && nextMatch[1].length <= level) {
          return { start: lineStart, end: nextLineStart };
        }
        searchPos = nextLineEnd === -1 ? content.length : nextLineEnd + 1;
      }
      return { start: lineStart, end: content.length };
    }
    pos = lineStart - 1;
  }
  return null;
};

export const isInSection = (content: string, selection: { start: number }): boolean => {
  return getSectionRange(content, selection.start) !== null;
};
