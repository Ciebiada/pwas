import { onCleanup, onMount } from "solid-js";
import "./customCaret.css";

const BLINK_DELAY_MS = 300;

const isHiddenElement = (element: Element) =>
  element.className === "markdown-prefix" ||
  element.className === "markdown-delimiter";

const getVisibleRect = (node: Node, atEnd: boolean): DOMRect | null => {
  const tempRange = document.createRange();
  if (node.nodeType === Node.TEXT_NODE) {
    const offset = atEnd ? (node.textContent?.length ?? 0) : 0;
    tempRange.setStart(node, offset);
  } else {
    tempRange.selectNodeContents(node);
    tempRange.collapse(!atEnd);
  }
  const rect = tempRange.getBoundingClientRect();
  return rect.height > 0 ? rect : null;
};

export const useCustomCaret = (getEditor: () => HTMLElement | undefined) => {
  onMount(() => {
    const editor = getEditor();
    if (!editor) return;

    const caret = document.createElement("div");
    caret.className = "custom-caret";
    document.body.appendChild(caret);

    let blinkTimeout: number | undefined;

    const clearBlinkTimer = () => {
      clearTimeout(blinkTimeout);
      blinkTimeout = undefined;
    };

    const startBlinkTimer = () => {
      clearBlinkTimer();
      caret.classList.remove("blinking");
      blinkTimeout = window.setTimeout(() => {
        caret.classList.add("blinking");
        blinkTimeout = undefined;
      }, BLINK_DELAY_MS);
    };

    const getValidCollapsedRange = () => {
      if (document.activeElement !== editor) return null;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return null;
      const range = selection.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return null;
      if (!range.collapsed || selection.toString().length > 0) return null;
      return range;
    };

    const getRectForVisibleContent = (range: Range): DOMRect => {
      const rect = range.getBoundingClientRect();
      if (rect.height > 0 && rect.width > 0) return rect;

      let node = range.startContainer.parentElement;
      while (node && node !== editor) {
        if (isHiddenElement(node)) {
          const next = node.nextSibling;
          if (next) {
            const nextRect = getVisibleRect(next, false);
            if (nextRect) return nextRect;
          }
          const prev = node.previousSibling;
          if (prev) {
            const prevRect = getVisibleRect(prev, true);
            if (prevRect) return prevRect;
          }
          break;
        }
        node = node.parentElement;
      }
      return rect;
    };

    const updateCaretPosition = () => {
      const range = getValidCollapsedRange();
      if (!range) return;
      const rect = getRectForVisibleContent(range);
      if (rect.height === 0) return;

      const left = rect.left + window.scrollX;
      const top = rect.top + window.scrollY;

      caret.style.left = `${left}px`;
      caret.style.top = `${top}px`;
      const width = Math.max(2, rect.height / 10);
      caret.style.width = `${width}px`;
      caret.style.borderRadius = `${width / 2}px`;
      caret.style.height = `${rect.height}px`;
      if (caret.style.opacity === "1") startBlinkTimer();
    };

    const showCaret = () => {
      editor.style.caretColor = "transparent";
      caret.style.opacity = "1";
      startBlinkTimer();
    };

    const hideCaret = () => {
      editor.style.caretColor = "var(--main-color)";
      caret.style.opacity = "0";
      clearBlinkTimer();
      caret.classList.remove("blinking");
    };

    const handleSelectionChange = () => {
      const range = getValidCollapsedRange();
      if (range) {
        updateCaretPosition();
        showCaret();
      } else {
        hideCaret();
      }
    };

    const handleFocus = () => handleSelectionChange();
    const handleVisibilityChange = () =>
      document.hidden ? hideCaret() : handleSelectionChange();

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("scroll", updateCaretPosition, true);
    window.addEventListener("resize", updateCaretPosition);
    editor.addEventListener("blur", hideCaret);
    editor.addEventListener("focus", handleFocus);

    onCleanup(() => {
      clearBlinkTimer();
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("scroll", updateCaretPosition, true);
      window.removeEventListener("resize", updateCaretPosition);
      editor.removeEventListener("blur", hideCaret);
      editor.removeEventListener("focus", handleFocus);
      caret.remove();
    });
  });
};
