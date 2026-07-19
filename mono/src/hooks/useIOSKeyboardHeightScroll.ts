import { onCleanup, onMount } from "solid-js";
import { isIOS } from "ui/platform";
import { scrollByDelta } from "../services/cursor";

const KEYBOARD_OPEN_THRESHOLD = 100;
const SETTLE_MS = 50;

// When the keyboard changes height while the editor is focused (text ↔ emoji
// switch), scroll by the height delta so the caret stays at the same distance
// from the keyboard. Symmetric — scrolls up when the keyboard grows (emoji is
// taller) and down when it shrinks (back to text). The initial open is handled
// by the editor's onFocus viewport tracker, which records the baseline after
// its final correction.
export const useIOSKeyboardHeightScroll = (getEditor: () => HTMLElement | undefined) => {
  let lastOffset = 0;
  let baselineSet = false;

  const recordBaseline = () => {
    if (isIOS && window.visualViewport) {
      const offset = window.innerHeight - window.visualViewport.height;
      if (offset >= KEYBOARD_OPEN_THRESHOLD) {
        lastOffset = offset;
        baselineSet = true;
      }
    }
  };

  onMount(() => {
    if (!isIOS || !window.visualViewport) return;

    let pendingStart: number | undefined;
    let scrollTimer: number | undefined;

    const handleViewportResize = () => {
      const editor = getEditor();
      if (!editor || document.activeElement !== editor) return;
      const vv = window.visualViewport;
      if (!vv) return;
      const offset = window.innerHeight - vv.height;

      if (offset < KEYBOARD_OPEN_THRESHOLD) {
        clearTimeout(scrollTimer);
        pendingStart = undefined;
        lastOffset = 0;
        baselineSet = false;
        return;
      }

      // Skip all events until recordBaseline has been called with a settled
      // post-open offset by the focus viewport tracker. Without this,
      // the multiple resize events iOS fires during the open animation would
      // trigger an unwanted delta scroll on top of scrollCursorIntoView.
      if (!baselineSet) return;

      if (pendingStart === undefined) pendingStart = lastOffset;
      clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        scrollTimer = undefined;
        if (pendingStart === undefined) return;
        const currentOffset = window.innerHeight - (window.visualViewport?.height ?? 0);
        const delta = currentOffset - pendingStart;
        pendingStart = undefined;
        lastOffset = currentOffset;
        if (delta === 0) return;
        const selection = window.getSelection();
        if (selection) scrollByDelta(selection, delta, "smooth");
      }, SETTLE_MS);
    };

    window.visualViewport.addEventListener("resize", handleViewportResize);
    onCleanup(() => {
      clearTimeout(scrollTimer);
      window.visualViewport?.removeEventListener("resize", handleViewportResize);
    });
  });

  return { recordBaseline };
};
