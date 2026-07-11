export const ZERO_WIDTH_SPACE = "\u200B";

export const countWithoutZeroWidthSpaces = (text: string): number => text.replaceAll(ZERO_WIDTH_SPACE, "").length;

export const getNodeTextLength = (node: Node | null): number => countWithoutZeroWidthSpaces(node?.textContent || "");

export const getOffsetInNode = (root: Node, target: Node, offset: number): number | null => {
  if (root === target) {
    if (root.nodeType === Node.TEXT_NODE) {
      return countWithoutZeroWidthSpaces((root.textContent || "").substring(0, offset));
    }

    let accumulated = 0;
    for (let index = 0; index < offset; index++) {
      accumulated += getNodeTextLength(root.childNodes[index]);
    }
    return accumulated;
  }

  let accumulated = 0;
  for (const child of root.childNodes) {
    const offsetInChild = getOffsetInNode(child, target, offset);
    if (offsetInChild !== null) {
      return accumulated + offsetInChild;
    }
    accumulated += getNodeTextLength(child);
  }

  return null;
};

export const getScrollParent = (node: Node | null): HTMLElement | null => {
  if (!node || !(node instanceof HTMLElement)) return null;

  const { overflowY } = window.getComputedStyle(node);
  const isScrollable = overflowY !== "visible" && overflowY !== "hidden";
  if (isScrollable && node.scrollHeight > node.clientHeight) return node;

  return getScrollParent(node.parentNode);
};

export const isElementHidden = (element: Element) =>
  element instanceof HTMLElement && window.getComputedStyle(element).display === "none";

export const getVisibleBoundaryRect = (node: Node | null | undefined, atEnd: boolean): DOMRect | null => {
  if (!node) return null;
  if (node instanceof Element && isElementHidden(node)) return null;

  if (node.nodeType !== Node.TEXT_NODE) {
    const children = Array.from(node.childNodes);
    const orderedChildren = atEnd ? children.toReversed() : children;

    for (const child of orderedChildren) {
      const childRect = getVisibleBoundaryRect(child, atEnd);
      if (childRect) return childRect;
    }
  }

  const range = document.createRange();
  if (node.nodeType === Node.TEXT_NODE) {
    const offset = atEnd ? (node.textContent?.length ?? 0) : 0;
    range.setStart(node, offset);
  } else {
    range.selectNodeContents(node);
    range.collapse(!atEnd);
  }

  const rect = range.getBoundingClientRect();
  return rect.height > 0 ? rect : null;
};

export const getCaretRect = (range: Range): DOMRect => {
  const rect = range.getBoundingClientRect();
  if (rect.height > 0) return rect;

  const container = range.startContainer;
  const offset = range.startOffset;
  const previousNode = container.nodeType === Node.TEXT_NODE ? container : container.childNodes[offset - 1];
  const nextNode = container.nodeType === Node.TEXT_NODE ? container : container.childNodes[offset];
  return getVisibleBoundaryRect(previousNode, true) ?? getVisibleBoundaryRect(nextNode, false) ?? rect;
};
