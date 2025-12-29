import DiffMatchPatch from "diff-match-patch";

type CursorPosition = {
  start: number;
  end: number;
};

const ZERO_WIDTH_SPACE = "\u200B";
const SCROLL_MARGIN_PX = 50;

/**
 * iOS autocapitalization fix: moves cursor from after zero-width space to before it.
 * This ensures iOS recognizes the cursor as being at the start of a line.
 */
export const fixCursorPositionForZeroWidthSpace = () => {
  const selection = window.getSelection();
  if (!selection || !selection.isCollapsed) return;

  const anchor = selection.anchorNode;
  if (anchor?.nodeType === Node.TEXT_NODE && anchor.textContent === ZERO_WIDTH_SPACE && selection.anchorOffset === 1) {
    const range = document.createRange();
    range.setStart(anchor, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
};

const countWithoutZeroWidthSpaces = (text: string): number => text.replaceAll(ZERO_WIDTH_SPACE, "").length;

const findActualOffset = (text: string, targetOffset: number): number => {
  let actualOffset = 0;
  let filteredOffset = 0;
  while (filteredOffset < targetOffset && actualOffset < text.length) {
    if (text[actualOffset] !== ZERO_WIDTH_SPACE) filteredOffset++;
    actualOffset++;
  }
  return actualOffset;
};

const getTextOffsetInContainer = (container: Node, offset: number): number =>
  countWithoutZeroWidthSpaces((container.textContent || "").substring(0, offset));

const getOffsetInElement = (element: HTMLElement, container: Node, offset: number): number => {
  let accumulated = 0;
  const childNodes = element.childNodes;

  for (let i = 0; i < childNodes.length; i++) {
    const child = childNodes[i];
    if (child.contains(container) || child === container) {
      if (child === container) {
        return accumulated + getTextOffsetInContainer(container, offset);
      }
      const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT, null);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node === container) {
          return accumulated + getTextOffsetInContainer(node, offset);
        }
        accumulated += countWithoutZeroWidthSpaces(node.textContent || "");
      }
      return accumulated;
    }
    const childText = child.textContent || "";
    accumulated += countWithoutZeroWidthSpaces(childText);
    // Add 1 for newline separator between blocks (except for last block)
    if (i < childNodes.length - 1) accumulated += 1;
  }
  return accumulated;
};

const getRangeAtOffset = (element: HTMLElement, offset: number): Range | null => {
  let accumulated = 0;
  const childNodes = element.childNodes;

  for (let i = 0; i < childNodes.length; i++) {
    const child = childNodes[i];
    const childText = child.textContent || "";
    const blockLength = countWithoutZeroWidthSpaces(childText);

    if (accumulated + blockLength >= offset) {
      const range = document.createRange();
      const offsetInBlock = offset - accumulated;
      try {
        const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT, null);
        let node: Node | null;
        let nodeOffset = 0;
        while ((node = walker.nextNode())) {
          const text = node.textContent || "";
          const filteredLength = countWithoutZeroWidthSpaces(text);
          if (nodeOffset + filteredLength >= offsetInBlock) {
            // Skip hidden nodes (e.g. markdown prefix) at boundary to prefer visible nodes
            const isHidden = node.parentElement?.classList.contains("markdown-prefix");
            if (isHidden && nodeOffset + filteredLength === offsetInBlock) {
              nodeOffset += filteredLength;
              continue;
            }

            const targetOffset = offsetInBlock - nodeOffset;
            const actualOffset = findActualOffset(text, targetOffset);
            range.setStart(node, actualOffset);
            range.collapse(true);
            return range;
          }
          nodeOffset += filteredLength;
        }
        range.selectNodeContents(child);
        range.collapse(true);
        return range;
      } catch (error) {
        console.error("Failed to create range:", error);
        return null;
      }
    }
    accumulated += blockLength + 1;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  return range;
};

export const scrollCursorIntoView = (selection: Selection, behavior: ScrollBehavior) => {
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const viewport = window.visualViewport;

  if (!viewport || (rect.top >= SCROLL_MARGIN_PX && rect.bottom <= viewport.height - SCROLL_MARGIN_PX)) {
    return;
  }

  range.commonAncestorContainer.parentElement?.scrollIntoView({ behavior, block: "center" });
};

export const getSelection = (element: HTMLElement): CursorPosition => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return { start: 0, end: 0 };
  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) return { start: 0, end: 0 };
  return {
    start: getOffsetInElement(element, range.startContainer, range.startOffset),
    end: getOffsetInElement(element, range.endContainer, range.endOffset),
  };
};

type SetSelectionOptions = {
  end?: number;
  scroll?: boolean;
};

export const setSelection = (
  element: HTMLElement,
  start: number,
  { end = start, scroll = false }: SetSelectionOptions = {},
) => {
  const selection = window.getSelection();
  if (!selection) return;
  const startRange = getRangeAtOffset(element, start);
  if (!startRange) return;

  if (start === end) {
    selection.removeAllRanges();
    selection.addRange(startRange);
  } else {
    const endRange = getRangeAtOffset(element, end);
    if (!endRange) return;
    const range = document.createRange();
    range.setStart(startRange.startContainer, startRange.startOffset);
    range.setEnd(endRange.startContainer, endRange.startOffset);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  if (scroll) scrollCursorIntoView(selection, "instant");
  else scrollCursorIntoView(selection, "smooth");
};

export const calculateCursorPosition = (currentContent: string, newContent: string, currentCursor: number): number => {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(currentContent, newContent);

  let newCursor = 0;
  let oldCursor = 0;

  for (const [type, text] of diffs) {
    const length = text.length;
    if (type === 0) {
      // EQUAL
      if (oldCursor + length > currentCursor) {
        newCursor += currentCursor - oldCursor;
        oldCursor = currentCursor; // Break condition met
        break;
      }
      newCursor += length;
      oldCursor += length;
    } else if (type === 1) {
      // INSERT
      newCursor += length;
    } else {
      // DELETE
      if (oldCursor + length > currentCursor) {
        // Cursor was inside the deleted text
        // We keep newCursor as is (start of deletion)
        oldCursor = currentCursor;
        break;
      }
      oldCursor += length;
    }
  }

  return newCursor;
};
