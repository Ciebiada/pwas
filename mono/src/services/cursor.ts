import {
  countWithoutZeroWidthSpaces,
  getNodeTextLength,
  getOffsetInNode,
  getScrollParent,
  ZERO_WIDTH_SPACE,
} from "./editorDom";

type CursorPosition = {
  start: number;
  end: number;
};

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

const findActualOffset = (text: string, targetOffset: number): number => {
  let actualOffset = 0;
  let filteredOffset = 0;
  while (filteredOffset < targetOffset && actualOffset < text.length) {
    if (text[actualOffset] !== ZERO_WIDTH_SPACE) filteredOffset++;
    actualOffset++;
  }
  return actualOffset;
};

const getEditorLines = (element: ParentNode): HTMLElement[] => Array.from(element.querySelectorAll(".md-line"));

const findFirstLine = (node: Node | null): HTMLElement | null => {
  if (!node) return null;
  if (node instanceof HTMLElement && node.classList.contains("md-line")) return node;

  for (const child of node.childNodes) {
    const line = findFirstLine(child);
    if (line) return line;
  }

  return null;
};

const findLastLine = (node: Node | null): HTMLElement | null => {
  if (!node) return null;
  if (node instanceof HTMLElement && node.classList.contains("md-line")) return node;

  const children = Array.from(node.childNodes).toReversed();
  for (const child of children) {
    const line = findLastLine(child);
    if (line) return line;
  }

  return null;
};

const getLineSelection = (
  element: HTMLElement,
  container: Node,
  offset: number,
): { line: HTMLElement; offsetInLine: number } | null => {
  const anchor =
    container.nodeType === Node.TEXT_NODE ? container.parentElement : container instanceof Element ? container : null;
  const line = anchor?.closest<HTMLElement>(".md-line");

  if (line && element.contains(line)) {
    return {
      line,
      offsetInLine: getOffsetInNode(line, container, offset) ?? 0,
    };
  }

  if (!(container instanceof Element)) return null;

  const previousLine = findLastLine(container.childNodes[offset - 1] ?? null);
  const nextLine = findFirstLine(container.childNodes[offset] ?? null);

  if (nextLine && element.contains(nextLine)) {
    return { line: nextLine, offsetInLine: 0 };
  }

  if (previousLine && element.contains(previousLine)) {
    return { line: previousLine, offsetInLine: getNodeTextLength(previousLine) };
  }

  return null;
};

const getOffsetInElement = (element: HTMLElement, container: Node, offset: number): number => {
  const lineSelection = getLineSelection(element, container, offset);
  if (!lineSelection) return getOffsetInNode(element, container, offset) ?? 0;

  const lines = getEditorLines(element);
  let accumulated = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line === lineSelection.line) return accumulated + lineSelection.offsetInLine;

    accumulated += getNodeTextLength(line);
    if (index < lines.length - 1) accumulated += 1;
  }

  return lineSelection.offsetInLine;
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
  const lines = getEditorLines(element);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const blockLength = getNodeTextLength(line);

    if (accumulated + blockLength >= offset) {
      return findRangeInChild(line, offset - accumulated);
    }
    accumulated += blockLength + 1;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  return range;
};

export const scrollCursorIntoView = (selection: Selection, behavior: ScrollBehavior) => {
  if (selection.rangeCount === 0) return;

  const viewport = window.visualViewport;
  if (!viewport) return;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  const viewportTop = document.querySelector<HTMLElement>(".header")!.offsetHeight;
  const viewportBottom = viewport.height - 24;

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

// Scroll the caret's scroll parent by an explicit delta (positive = content up).
// Used to keep the caret at a consistent distance from the keyboard when the
// keyboard height changes mid-focus (e.g. text ↔ emoji switch), in both
// directions — unlike scrollCursorIntoView, which only corrects when the caret
// is outside the visible band.
export const scrollByDelta = (selection: Selection, delta: number, behavior: ScrollBehavior) => {
  if (selection.rangeCount === 0 || delta === 0) return;
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as HTMLElement);
  if (!element) return;
  const scrollParent = getScrollParent(element);
  if (scrollParent) {
    scrollParent.scrollTo({ top: scrollParent.scrollTop + Math.ceil(delta), behavior });
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

export const calculateCursorPosition = (currentContent: string, newContent: string, currentCursor: number): number => {
  const minLength = Math.min(currentContent.length, newContent.length);

  let prefix = 0;
  while (prefix < minLength && currentContent[prefix] === newContent[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < minLength - prefix &&
    currentContent[currentContent.length - 1 - suffix] === newContent[newContent.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const oldChangeEnd = currentContent.length - suffix;
  const newChangeEnd = newContent.length - suffix;

  if (currentCursor <= prefix) return currentCursor;
  if (currentCursor >= oldChangeEnd) return currentCursor + (newContent.length - currentContent.length);
  return Math.min(currentCursor, newChangeEnd);
};
