import { getLineRange } from "./utils";

export const renumberOrderedList = (
  content: string,
  cursor: number,
): { content: string; cursor: number } => {
  // Optimization: Check if current or neighboring lines are ordered lists before splitting
  const { start: lineStart, end: lineEnd } = getLineRange(content, cursor);
  const currentLineText = content.slice(lineStart, lineEnd);

  // Check active line
  if (!/^(\s*)(\d+\.\s)/.test(currentLineText)) {
    // Check next line content efficiently
    const nextLineStart = lineEnd + 1; // Skip newline
    if (nextLineStart < content.length) {
      const nextLineEnd = content.indexOf("\n", nextLineStart);
      const nextLineText = content.slice(
        nextLineStart,
        nextLineEnd === -1 ? content.length : nextLineEnd,
      );
      if (!/^(\s*)(\d+\.\s)/.test(nextLineText)) {
        return { content, cursor };
      }
    } else {
      // No next line, and current line isn't a list
      return { content, cursor };
    }
  }

  const lines = content.split("\n");
  const lineIndex = content.slice(0, cursor).split("\n").length - 1;
  let currentCursor = cursor;

  const updateLine = (idx: number, newContent: string) => {
    const oldLength = lines[idx].length;
    const newLength = newContent.length;
    if (idx < lineIndex) {
      currentCursor += newLength - oldLength;
    } else if (idx === lineIndex) {
      // If cursor is on the line being updated, we assume it's after the prefix
      // and needs to move with the prefix change.
      currentCursor += newLength - oldLength;
    }
    lines[idx] = newContent;
  };

  // Find the start of the current ordered list block at this indentation level
  const currentLine = lines[lineIndex];
  const currentMatch = currentLine.match(/^(\s*)(\d+\.\s)/);

  if (!currentMatch) {
    // If current line is no longer an ordered list (e.g. just removed prefix),
    // we still want to renumber the rest. We need the indent of the *rest*.
    const nextLine = lines[lineIndex + 1];
    const nextMatch = nextLine?.match(/^(\s*)(\d+\.\s)/);
    if (!nextMatch) return { content, cursor };

    const indent = nextMatch[1];
    let expectedNum = 1;
    // We do NOT look back at prevMatch here because we are establishing continuity
    // from a broken list (current line was just cleared/removed).
    // So the next block starts fresh at 1.

    for (let i = lineIndex + 1; i < lines.length; i++) {
      const match = lines[i].match(/^(\s*)(\d+)\.\s(.*)/);
      if (!match) {
        // Not a list item at all
        if (lines[i].trim() !== "") break;
        // Stop at empty line to respect paragraph boundaries
        if (lines[i].trim() === "") break;
        continue;
      }

      const currentIndent = match[1];
      if (currentIndent.length < indent.length) {
        break; // Out of nested list
      }
      if (currentIndent.length > indent.length) {
        continue; // Deeply nested
      }

      // Check for empty line breaking continuity (same indent but empty line before?)
      if (lines[i].trim() === "") {
        break;
      }

      updateLine(i, `${indent}${expectedNum}. ${match[3]}`);
      expectedNum++;
    }
    return { content: lines.join("\n"), cursor: currentCursor };
  }

  const indent = currentMatch[1];
  let startIdx = lineIndex;
  while (startIdx > 0) {
    const prevLine = lines[startIdx - 1];
    const indentMatch = prevLine.match(/^(\s*)/);
    const prevIndentLen = indentMatch ? indentMatch[1].length : 0;

    if (prevIndentLen > indent.length) {
      // Deeper indentation (nested content/list) - blindly skip
      startIdx--;
      continue;
    }

    if (prevLine.trim() === "") {
      break; // Stop at empty line
    }

    if (prevIndentLen < indent.length) {
      // Shallower - parent - stop
      break;
    }

    // Same indentation
    const isOrdered = /^\s*\d+\.\s/.test(prevLine);
    if (isOrdered) {
      startIdx--; // It's a sibling, include it in our block
    } else {
      // Same indent but not ordered number -> breaks the ordered list sequence
      break;
    }
  }

  let expectedNum = parseInt(lines[startIdx].match(/\d+/)?.[0] || "1");
  for (let i = startIdx + 1; i < lines.length; i++) {
    // Check for empty line break
    if (lines[i].trim() === "") {
      break;
    }

    const match = lines[i].match(/^(\s*)(\d+)\.\s(.*)/);
    if (!match) {
      if (lines[i].trim() !== "") break;
      // Stop at empty line to respect paragraph boundaries
      if (lines[i].trim() === "") break;
      continue;
    }

    const currentIndent = match[1];
    if (currentIndent.length < indent.length) {
      break; // Out of nested list
    }
    if (currentIndent.length > indent.length) {
      continue; // Deeply nested
    }

    expectedNum++;
    updateLine(i, `${indent}${expectedNum}. ${match[3]}`);
  }

  return { content: lines.join("\n"), cursor: currentCursor };
};
