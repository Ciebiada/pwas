export type Selection = { start: number; end: number };
export type InputResult = { content: string; cursor: number };

export const INDENT = "    ";
export const INDENT_SIZE = INDENT.length;

export const LIST_PATTERN = /^(\s*([-*]|\d+\.)\s(?:\[[ x]\]\s)?)/;

export const getLineRange = (content: string, position: number) => {
  const start = content.lastIndexOf("\n", position - 1) + 1;
  const endIndex = content.indexOf("\n", position);
  const end = endIndex === -1 ? content.length : endIndex;
  return { start, end, line: content.slice(start, end) };
};

export const lineEnd = (content: string, start: number) => {
  const index = content.indexOf("\n", start);
  return index === -1 ? content.length : index;
};

export const insert = (
  content: string,
  start: number,
  end: number,
  text: string,
) => content.slice(0, start) + text + content.slice(end);
