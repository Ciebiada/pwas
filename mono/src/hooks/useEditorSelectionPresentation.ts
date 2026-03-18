import { onCleanup, onMount } from "solid-js";
import { fixCursorPositionForZeroWidthSpace, getSelection } from "../services/cursor";

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

const getSelectionAnchorElement = (editor: HTMLElement): Element | null => {
  if (document.activeElement !== editor) return null;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return null;

  const anchor =
    range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
  return anchor instanceof Element ? anchor : null;
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
  onCursorChange?: (cursor: number) => void;
};

export const useEditorSelectionPresentation = (options: UseEditorSelectionPresentationOptions) => {
  let activeInlineFormat: HTMLElement | null = null;
  let activeLine: HTMLElement | null = null;

  const sync = () => {
    const editor = options.getEditor();
    if (!editor) return;

    const anchor = getSelectionAnchorElement(editor);
    activeInlineFormat = syncActiveElement(
      activeInlineFormat,
      anchor?.closest<HTMLElement>(".md-inline-format") ?? null,
      "is-active-inline-format",
    );
    activeLine = syncActiveElement(activeLine, anchor?.closest<HTMLElement>(".md-line") ?? null, "is-active-line");
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
    options.onCursorChange?.(getSelection(editor).start);
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
      activeInlineFormat = syncActiveElement(activeInlineFormat, null, "is-active-inline-format");
      activeLine = syncActiveElement(activeLine, null, "is-active-line");
      document.removeEventListener("selectionchange", handleSelectionChange);
    });
  });

  return {
    handleKeyDown,
    sync,
  };
};
