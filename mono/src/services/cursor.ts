import DiffMatchPatch from "diff-match-patch";

type CursorPosition = {
  start: number;
  end: number;
};

const ZERO_WIDTH_SPACE = "\u200B";

/**
 * iOS autocapitalization fix: moves cursor from after zero-width space to before it.
 * This ensures iOS recognizes the cursor as being at the start of a line.
 */
export const fixCursorPositionForZeroWidthSpace = () => {
  const selection = window.getSelection();
  if (!selection?.isCollapsed) return;

  const anchor = selection.anchorNode;
  if (anchor?.nodeType !== Node.TEXT_NODE) return;
  if (anchor.textContent !== ZERO_WIDTH_SPACE) return;
  if (selection.anchorOffset !== 1) return;

  const range = document.createRange();
  range.setStart(anchor, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
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

const getOffsetWithinChild = (child: Node, container: Node, offset: number): number | null => {
  if (child === container) {
    return getTextOffsetInContainer(container, offset);
  }

  const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT, null);
  let node: Node | null;
  let localAccumulated = 0;

  while ((node = walker.nextNode())) {
    if (node === container) {
      return localAccumulated + getTextOffsetInContainer(node, offset);
    }
    localAccumulated += countWithoutZeroWidthSpaces(node.textContent || "");
  }
  return null;
};

const getOffsetInElement = (element: HTMLElement, container: Node, offset: number): number => {
  let accumulated = 0;
  const childNodes = element.childNodes;

  for (let i = 0; i < childNodes.length; i++) {
    const child = childNodes[i];
    if (child.contains(container) || child === container) {
      const offsetInChild = getOffsetWithinChild(child, container, offset);
      return accumulated + (offsetInChild ?? 0);
    }

    accumulated += countWithoutZeroWidthSpaces(child.textContent || "");
    // Add 1 for newline separator between blocks (except for last block)
    if (i < childNodes.length - 1) accumulated += 1;
  }
  return accumulated;
};

const findRangeInChild = (child: Node, offsetInBlock: number): Range | null => {
  const range = document.createRange();
  try {
    const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT, null);
    let node: Node | null;
    let nodeOffset = 0;

    while ((node = walker.nextNode())) {
      const text = node.textContent || "";
      const filteredLength = countWithoutZeroWidthSpaces(text);
      if (nodeOffset + filteredLength >= offsetInBlock) {
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
};

const getRangeAtOffset = (element: HTMLElement, offset: number): Range | null => {
  let accumulated = 0;
  const childNodes = element.childNodes;

  for (let i = 0; i < childNodes.length; i++) {
    const child = childNodes[i];
    const blockLength = countWithoutZeroWidthSpaces(child.textContent || "");

    if (accumulated + blockLength >= offset) {
      return findRangeInChild(child, offset - accumulated);
    }
    accumulated += blockLength + 1;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  return range;
};

const getScrollParent = (node: Node | null): HTMLElement | null => {
  if (!node || !(node instanceof HTMLElement)) {
    return null;
  }

  const { overflowY } = window.getComputedStyle(node);
  const isScrollable = overflowY !== "visible" && overflowY !== "hidden";

  if (isScrollable && node.scrollHeight > node.clientHeight) {
    return node;
  }

  return getScrollParent(node.parentNode);
};

export const scrollCursorIntoView = (selection: Selection, behavior: ScrollBehavior) => {
  if (selection.rangeCount === 0) return;

  const viewport = window.visualViewport;
  if (!viewport) return;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  const viewportTop = document.querySelector<HTMLElement>(".header")!.offsetHeight;
  const viewportBottom = viewport.height - 16;

  let delta = 0;
  if (rect.top < viewportTop) {
    delta = rect.top - viewportTop;
  } else if (rect.bottom > viewportBottom) {
    delta = rect.bottom - viewportBottom;
  }

  if (delta === 0) return;

  const container = range.commonAncestorContainer;
  const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as HTMLElement);

  if (!element) return;

  const scrollParent = getScrollParent(element);
  if (scrollParent) {
    scrollParent.scrollTo({
      top: scrollParent.scrollTop + Math.ceil(delta),
      behavior,
    });
  }
};

export const scrollWhenViewportStable = (run: () => void, maxWaitMs = 1000) => {
  const viewport = window.visualViewport;
  requestAnimationFrame(run);
  if (!viewport) return;

  let lastHeight = viewport.height;
  let lastTop = viewport.offsetTop;
  let stable = 0;
  let changed = false;
  const start = performance.now();

  const tick = () => {
    const height = viewport.height;
    const top = viewport.offsetTop;

    if (Math.abs(height - lastHeight) < 1 && Math.abs(top - lastTop) < 1) {
      if (changed) stable += 1;
    } else {
      changed = true;
      stable = 0;
      lastHeight = height;
      lastTop = top;
    }

    if (changed && stable >= 2) return run();
    if (changed && performance.now() - start > maxWaitMs) return run();
    if (performance.now() - start > maxWaitMs) return;

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
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

export const setSelection = (element: HTMLElement, start: number, { end = start }: SetSelectionOptions = {}) => {
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

  return selection;
};

const DIFF_TYPE = {
  EQUAL: 0,
  INSERT: 1,
  DELETE: -1,
} as const;

export const calculateCursorPosition = (currentContent: string, newContent: string, currentCursor: number): number => {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(currentContent, newContent);

  let newCursor = 0;
  let oldCursor = 0;

  for (const [type, text] of diffs) {
    const length = text.length;
    switch (type) {
      case DIFF_TYPE.EQUAL:
        if (oldCursor + length > currentCursor) {
          // Cursor is within this equal block
          newCursor += currentCursor - oldCursor;
          return newCursor;
        }
        newCursor += length;
        oldCursor += length;
        break;
      case DIFF_TYPE.INSERT:
        newCursor += length;
        break;
      case DIFF_TYPE.DELETE:
        if (oldCursor + length > currentCursor) {
          // Cursor was inside the deleted text
          // Return known newCursor (start of deletion)
          return newCursor;
        }
        oldCursor += length;
        break;
    }
  }

  return newCursor;
};
