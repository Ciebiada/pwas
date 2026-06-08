import { onCleanup, onMount } from "solid-js";
import { getVisibleBoundaryRect, isElementHidden } from "../services/editorDom";
import "./usePrettyCaret.css";

const BLINK_DELAY_MS = 300;

const getBoundaryRect = (range: Range): DOMRect | null => {
  const container = range.startContainer;
  if (!(container instanceof Element)) return null;

  const nextNode = container.childNodes[range.startOffset];
  if (nextNode) {
    const nextRect = getVisibleBoundaryRect(nextNode, false);
    if (nextRect) return nextRect;
  }

  const previousNode = container.childNodes[range.startOffset - 1];
  if (previousNode) {
    const previousRect = getVisibleBoundaryRect(previousNode, true);
    if (previousRect) return previousRect;
  }

  return null;
};

export const usePrettyCaret = (
  getContainer: () => HTMLElement | undefined,
  getEditor: () => HTMLElement | undefined,
) => {
  let sync = () => {};

  onMount(() => {
    const editor = getEditor();
    const container = getContainer();

    if (!editor || !container) return;

    const caret = document.createElement("div");
    caret.className = "custom-caret";
    container.appendChild(caret);

    let blinkTimeout: number | undefined;
    let focusSettleFrame: number | undefined;
    let focusSettleToken = 0;
    let isFocusSettling = false;
    let selectionFrame: number | undefined;
    let showFrame: number | undefined;

    const clearBlinkTimer = () => {
      clearTimeout(blinkTimeout);
      blinkTimeout = undefined;
    };

    const clearSelectionFrame = () => {
      cancelAnimationFrame(selectionFrame);
      selectionFrame = undefined;
    };

    const clearFocusSettleFrame = () => {
      cancelAnimationFrame(focusSettleFrame);
      focusSettleFrame = undefined;
    };

    const clearShowFrame = () => {
      cancelAnimationFrame(showFrame);
      showFrame = undefined;
    };

    const startBlinkTimer = () => {
      clearBlinkTimer();
      caret.classList.remove("blinking");
      blinkTimeout = window.setTimeout(() => {
        caret.classList.add("blinking");
        blinkTimeout = undefined;
      }, BLINK_DELAY_MS);
    };

    const getValidCollapsedRange = (requireFocus = true) => {
      if (requireFocus && document.activeElement !== editor) return null;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return null;
      const range = selection.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return null;
      if (!range.collapsed || selection.toString().length > 0) return null;
      return range;
    };

    const getRectForVisibleContent = (range: Range): DOMRect => {
      const rect = range.getBoundingClientRect();
      if (rect.height > 0) return rect;

      const boundaryRect = getBoundaryRect(range);
      if (boundaryRect) return boundaryRect;

      let node = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : null;
      while (node && node !== editor) {
        if (isElementHidden(node)) {
          const next = node.nextSibling;
          if (next) {
            const nextRect = getVisibleBoundaryRect(next, false);
            if (nextRect) return nextRect;
          }
          const prev = node.previousSibling;
          if (prev) {
            const prevRect = getVisibleBoundaryRect(prev, true);
            if (prevRect) return prevRect;
          }
          break;
        }
        node = node.parentElement;
      }
      return rect;
    };

    const updateCaretPosition = (requireFocus = true) => {
      const range = getValidCollapsedRange(requireFocus);
      if (!range || !container) return;

      const rect = getRectForVisibleContent(range);
      if (rect.height === 0) return;

      const containerRect = container.getBoundingClientRect();
      const left = rect.left - containerRect.left;
      const top = rect.top - containerRect.top;

      caret.style.left = `${left}px`;
      caret.style.top = `${top}px`;
      const width = Math.max(2, rect.height / 10);
      caret.style.width = `${width}px`;
      caret.style.borderRadius = `${width / 2}px`;
      caret.style.height = `${rect.height}px`;
      if (caret.classList.contains("is-visible")) startBlinkTimer();
    };

    const showCaret = () => {
      editor.style.caretColor = "transparent";
      caret.classList.add("is-visible");
      caret.style.opacity = "1";
      startBlinkTimer();
    };

    const concealCaret = () => {
      caret.classList.remove("is-visible");
      caret.style.opacity = "0";
      clearShowFrame();
      clearBlinkTimer();
      caret.classList.remove("blinking");
    };

    const hideCaret = () => {
      focusSettleToken += 1;
      isFocusSettling = false;
      clearFocusSettleFrame();
      editor.style.caretColor = "var(--main-color)";
      concealCaret();
    };

    const scheduleFocusSettledShow = () => {
      const token = ++focusSettleToken;
      let remainingFrames = 2;

      clearShowFrame();
      clearFocusSettleFrame();

      const settle = () => {
        focusSettleFrame = undefined;
        if (token !== focusSettleToken) return;

        if (!getValidCollapsedRange()) {
          hideCaret();
          return;
        }

        updateCaretPosition(false);
        if (remainingFrames > 0) {
          remainingFrames -= 1;
          focusSettleFrame = requestAnimationFrame(settle);
          return;
        }

        isFocusSettling = false;
        showCaret();
      };

      focusSettleFrame = requestAnimationFrame(settle);
    };

    const handleSelectionChange = () => {
      const range = getValidCollapsedRange(false);
      if (!range) {
        hideCaret();
        return;
      }

      updateCaretPosition(false);
      if (document.activeElement !== editor) {
        hideCaret();
        return;
      }

      if (isFocusSettling) {
        scheduleFocusSettledShow();
        return;
      }

      clearShowFrame();
      showFrame = requestAnimationFrame(() => {
        showFrame = undefined;
        if (getValidCollapsedRange()) showCaret();
      });
    };

    const scheduleSelectionChange = () => {
      clearSelectionFrame();
      selectionFrame = requestAnimationFrame(() => {
        selectionFrame = undefined;
        handleSelectionChange();
      });
    };

    const handleFocus = () => {
      isFocusSettling = true;
      focusSettleToken += 1;
      editor.style.caretColor = "transparent";
      concealCaret();
      clearFocusSettleFrame();
      scheduleSelectionChange();
    };

    const handleBlur = () => requestAnimationFrame(hideCaret);
    const handleVisibilityChange = () => (document.hidden ? hideCaret() : scheduleSelectionChange());

    document.addEventListener("selectionchange", scheduleSelectionChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("resize", updateCaretPosition);
    editor.addEventListener("blur", handleBlur);
    editor.addEventListener("focus", handleFocus);
    sync = handleSelectionChange;
    sync();

    onCleanup(() => {
      sync = () => {};
      clearBlinkTimer();
      clearFocusSettleFrame();
      clearSelectionFrame();
      clearShowFrame();
      document.removeEventListener("selectionchange", scheduleSelectionChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("resize", updateCaretPosition);
      editor.removeEventListener("blur", handleBlur);
      editor.removeEventListener("focus", handleFocus);
      caret.remove();
    });
  });

  return {
    sync: () => sync(),
  };
};
