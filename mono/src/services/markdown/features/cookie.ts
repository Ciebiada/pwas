import { calculateCursorPosition } from "../../cursor";
import { LIST_PATTERN, TODO_LIST_PATTERN } from "../utils";

const HAS_COOKIE_PATTERN = /\[(?:\/|%|\d+\/\d+|\d+%)\]/;
const COOKIE_PATTERN = /\[(?:\/|%|\d+\/\d+|\d+%)\]/g;

type CookieStats = {
  checked: number;
  total: number;
};

const getIndentation = (line: string) => line.match(/^ */)?.[0].length ?? 0;

const isListItem = (line: string) => LIST_PATTERN.test(line);

const getIndentedChildStats = (lines: string[], lineIndex: number, currentIndentation: number): CookieStats => {
  let childIndentation: number | null = null;
  let checked = 0;
  let total = 0;

  for (let index = lineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || line.trim() === "") continue;

    const indentation = getIndentation(line);
    if (indentation <= currentIndentation) break;
    if (childIndentation === null) childIndentation = indentation;
    if (indentation !== childIndentation) continue;

    const checkboxMatch = line.match(TODO_LIST_PATTERN);
    if (!checkboxMatch) continue;

    total += 1;
    if (checkboxMatch[2] === "x") checked += 1;
  }

  return { checked, total };
};

const getFollowingBlockStats = (lines: string[], lineIndex: number): CookieStats => {
  let firstBlockIndex = -1;

  for (let index = lineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line && line.trim() !== "") {
      firstBlockIndex = index;
      break;
    }
  }

  if (firstBlockIndex === -1) return { checked: 0, total: 0 };

  const blockIndentation = getIndentation(lines[firstBlockIndex]);
  let checked = 0;
  let total = 0;

  for (let index = firstBlockIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || line.trim() === "") continue;

    const indentation = getIndentation(line);
    if (indentation < blockIndentation) break;
    if (index !== firstBlockIndex && indentation === blockIndentation && !isListItem(line)) break;
    if (indentation !== blockIndentation) continue;

    const checkboxMatch = line.match(TODO_LIST_PATTERN);
    if (!checkboxMatch) continue;

    total += 1;
    if (checkboxMatch[2] === "x") checked += 1;
  }

  return { checked, total };
};

const getCookieStats = (lines: string[], lineIndex: number): CookieStats | null => {
  const currentLine = lines[lineIndex];
  if (currentLine === undefined) return null;

  return isListItem(currentLine)
    ? getIndentedChildStats(lines, lineIndex, getIndentation(currentLine))
    : getFollowingBlockStats(lines, lineIndex);
};

const updateCookieToken = (token: string, stats: CookieStats) => {
  if (token.includes("/") || token === "[/]") {
    return `[${stats.checked}/${stats.total}]`;
  }

  const percent = Math.round((stats.checked / Math.max(stats.total, 1)) * 100);
  return `[${percent}%]`;
};

export const syncTaskCookies = (content: string): string => {
  const lines = content.split("\n");

  const nextLines = lines.map((line, index) => {
    if (!HAS_COOKIE_PATTERN.test(line)) return line;
    const stats = getCookieStats(lines, index);
    if (!stats) return line;

    return line.replace(COOKIE_PATTERN, (token) => updateCookieToken(token, stats));
  });

  return nextLines.join("\n");
};

export const syncTaskCookiesWithCursor = (content: string, cursor: number) => {
  const nextContent = syncTaskCookies(content);
  if (nextContent === content) return { content, cursor };

  return {
    content: nextContent,
    cursor: calculateCursorPosition(content, nextContent, cursor),
  };
};
