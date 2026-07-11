import { onCleanup, onMount } from "solid-js";
import { fixCursorPositionForZeroWidthSpace, getSelection } from "../services/cursor";
import { getCaretRect, getOffsetInNode, getScrollParent } from "../services/editorDom";

const syncActiveElement = (
  current: HTMLElement | null,
  next: HTMLElement | null,
  className: string,
): HTMLElement | null => {
  if (current === next) return current;

  current?.classList.remove(className);
  next?.classList.add(className);
  return next;
};

const syncActiveCodeBlock = (editor: HTMLElement, currentId: string | null, nextId: string | null): string | null => {
  if (currentId && currentId !== nextId) {
    for (const line of editor.querySelectorAll<HTMLElement>(`[data-code-block-id="${currentId}"]`)) {
      line.classList.remove("is-active-code-block");
    }
  }

  if (nextId) {
    for (const line of editor.querySelectorAll<HTMLElement>(`[data-code-block-id="${nextId}"]`)) {
      line.classList.add("is-active-code-block");
    }
  }

  return nextId;
};

const HEADING_LINE_SELECTOR = ".md-h1, .md-h2, .md-h3";

const isHeadingLine = (line: HTMLElement | null): line is HTMLElement => line?.matches(HEADING_LINE_SELECTOR) ?? false;

type CollapsedSelection = {
  anchor: Element;
  line: HTMLElement | null;
  offsetInLine: number | null;
};

const getCollapsedSelection = (editor: HTMLElement): CollapsedSelection | null => {
  if (document.activeElement !== editor) return null;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return null;

  const anchor =
    range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
  if (!(anchor instanceof Element)) return null;

  const line = anchor.closest<HTMLElement>(".md-line");
  return {
    anchor,
    line,
    offsetInLine: isHeadingLine(line) ? getOffsetInNode(line, range.startContainer, range.startOffset) : null,
  };
};

const isHeadingPrefixActive = (line: HTMLElement | null, offsetInLine: number | null) => {
  if (!isHeadingLine(line) || offsetInLine === null) return false;

  for (const child of line.children) {
    if (child instanceof HTMLElement && child.classList.contains("markdown-prefix")) {
      return offsetInLine <= (child.textContent?.length ?? 0);
    }
  }

  return false;
};

const moveSelectionPastHiddenInlineFormat = (editor: HTMLElement) => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return false;

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return false;

  const container = range.startContainer;
  if (container.nodeType !== Node.TEXT_NODE || range.startOffset !== container.textContent!.length) return false;

  const delimiter = container.nextSibling;
  if (!(delimiter instanceof HTMLSpanElement) || !delimiter.classList.contains("markdown-delimiter")) return false;

  const inlineFormat = delimiter.closest(".md-inline-format");
  if (!inlineFormat) return false;

  const nextRange = document.createRange();
  nextRange.setStartAfter(inlineFormat);
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
  return true;
};

const moveSelectionIntoHiddenInlineFormat = (editor: HTMLElement) => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return false;

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return false;

  const container = range.startContainer;
  const previousNode =
    container instanceof Element
      ? container.childNodes[range.startOffset - 1]
      : container.nodeType === Node.TEXT_NODE && range.startOffset === 0
        ? container.previousSibling
        : null;
  if (!(previousNode instanceof HTMLElement) || !previousNode.classList.contains("md-inline-format")) return false;

  const delimiter = previousNode.lastElementChild;
  const textNode = Array.from(previousNode.childNodes)
    .reverse()
    .find((node) => node.nodeType === Node.TEXT_NODE && (node.textContent?.length ?? 0) > 0);

  if (!(delimiter instanceof HTMLSpanElement) || !delimiter.classList.contains("markdown-delimiter")) return false;

  const nextRange = document.createRange();
  if (textNode instanceof Text) {
    nextRange.setStart(textNode, textNode.textContent?.length ?? 0);
  } else {
    nextRange.setStart(previousNode, 1);
  }
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
  return true;
};

type UseEditorSelectionPresentationOptions = {
  getEditor: () => HTMLElement | undefined;
  isIOS: boolean;
  onSelectionChange?: (selection: { start: number; end: number }) => void;
};

export const useEditorSelectionPresentation = (options: UseEditorSelectionPresentationOptions) => {
  let activeInlineFormat: HTMLElement | null = null;
  let activeLine: HTMLElement | null = null;
  let activeHeadingPrefixLine: HTMLElement | null = null;
  let activeCodeBlockId: string | null = null;

  const sync = () => {
    const editor = options.getEditor();
    if (!editor) return;

    const selection = getCollapsedSelection(editor);
    const anchor = selection?.anchor;
    const nextInlineFormat = anchor?.closest<HTMLElement>(".md-inline-format") ?? null;
    const preserveCaretPosition = options.isIOS && activeInlineFormat !== nextInlineFormat;
    const domSelection = preserveCaretPosition ? window.getSelection() : null;
    const range = domSelection?.rangeCount ? domSelection.getRangeAt(0) : null;
    const scrollParent = range ? getScrollParent(anchor ?? null) : null;
    const caretTop = range ? getCaretRect(range).top : null;

    activeInlineFormat = syncActiveElement(activeInlineFormat, nextInlineFormat, "is-active-inline-format");

    if (range && scrollParent && caretTop !== null) {
      const delta = getCaretRect(range).top - caretTop;
      if (Math.abs(delta) >= 1) {
        scrollParent.scrollTo({ top: scrollParent.scrollTop + delta, behavior: "instant" });
      }
    }

    activeLine = syncActiveElement(activeLine, selection?.line ?? null, "is-active-line");
    const headingPrefixLine = isHeadingPrefixActive(selection?.line ?? null, selection?.offsetInLine ?? null)
      ? (selection?.line ?? null)
      : null;
    activeHeadingPrefixLine = syncActiveElement(activeHeadingPrefixLine, headingPrefixLine, "is-active-heading-prefix");
    activeCodeBlockId = syncActiveCodeBlock(
      editor,
      activeCodeBlockId,
      anchor?.closest<HTMLElement>("[data-code-block-id]")?.dataset.codeBlockId ?? null,
    );
  };

  const handleSelectionChange = () => {
    const editor = options.getEditor();
    if (!editor) return;

    if (document.activeElement !== editor) {
      sync();
      return;
    }

    if (options.isIOS) fixCursorPositionForZeroWidthSpace();
    sync();
    options.onSelectionChange?.(getSelection(editor));
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const editor = options.getEditor();
    if (!editor) return false;

    if (event.key === "ArrowRight" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      if (moveSelectionPastHiddenInlineFormat(editor)) {
        sync();
        return true;
      }
    }

    if (event.key === "ArrowLeft" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      if (moveSelectionIntoHiddenInlineFormat(editor)) {
        sync();
        return true;
      }
    }

    return false;
  };

  onMount(() => {
    document.addEventListener("selectionchange", handleSelectionChange);

    onCleanup(() => {
      const editor = options.getEditor();
      activeInlineFormat = syncActiveElement(activeInlineFormat, null, "is-active-inline-format");
      activeLine = syncActiveElement(activeLine, null, "is-active-line");
      activeHeadingPrefixLine = syncActiveElement(activeHeadingPrefixLine, null, "is-active-heading-prefix");
      if (editor) activeCodeBlockId = syncActiveCodeBlock(editor, activeCodeBlockId, null);
      document.removeEventListener("selectionchange", handleSelectionChange);
    });
  });

  return {
    handleKeyDown,
    sync,
  };
};
