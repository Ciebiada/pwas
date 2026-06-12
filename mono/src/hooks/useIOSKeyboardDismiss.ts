import { onCleanup, onMount } from "solid-js";

const IOS_KEYBOARD_OFFSET_THRESHOLD = 20;

type UseIOSKeyboardDismissOptions = {
  isIOS: boolean;
  getEditor: () => HTMLElement | undefined;
  isReordering: () => boolean;
  onDismiss: () => void;
};

// On iOS the software keyboard can close without the editor losing DOM focus
// (e.g. the keyboard's own "hide" key). Watch visualViewport height to detect
// that case and dismiss, while ignoring the spurious resize that a line-reorder
// drag triggers. No-ops off iOS.
export const useIOSKeyboardDismiss = (options: UseIOSKeyboardDismissOptions) => {
  let didSeeKeyboard = false;
  let ignoreNextBlur = false;
  let ignoreNextBlurTimeout: number | undefined;

  const ignoreNextBlurForReorder = () => {
    ignoreNextBlur = true;
    clearTimeout(ignoreNextBlurTimeout);
    ignoreNextBlurTimeout = window.setTimeout(() => {
      ignoreNextBlur = false;
      ignoreNextBlurTimeout = undefined;
    }, 600);
  };

  const handleViewportResize = () => {
    const editor = options.getEditor();
    const keyboardVisible =
      !!window.visualViewport && window.innerHeight - window.visualViewport.height > IOS_KEYBOARD_OFFSET_THRESHOLD;
    const editorHasDOMFocus = !!editor && document.activeElement === editor;

    if (options.isReordering()) {
      didSeeKeyboard = false;
      return;
    }

    if (keyboardVisible) {
      if (editorHasDOMFocus) didSeeKeyboard = true;
      return;
    }

    if (ignoreNextBlur) {
      ignoreNextBlur = false;
      didSeeKeyboard = false;
      clearTimeout(ignoreNextBlurTimeout);
      ignoreNextBlurTimeout = undefined;
      return;
    }

    if (!didSeeKeyboard) return;
    didSeeKeyboard = false;
    if (!editorHasDOMFocus) return;

    options.onDismiss();
  };

  onMount(() => {
    onCleanup(() => clearTimeout(ignoreNextBlurTimeout));

    const visualViewport = window.visualViewport;
    if (!options.isIOS || !visualViewport) return;

    visualViewport.addEventListener("resize", handleViewportResize);
    onCleanup(() => visualViewport.removeEventListener("resize", handleViewportResize));
  });

  return { ignoreNextBlurForReorder };
};
