import { onCleanup, onMount } from "solid-js";
import "./useAnimatedCheckbox.css";

export const useAnimatedCheckbox = (getEditor: () => HTMLElement | undefined) => {
  onMount(() => {
    const editor = getEditor();
    if (!editor) return;

    // Enable animations only after first mount
    editor.classList.add("checkbox-animations-ready");

    let lastClickedId: string | null = null;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      const label = target.closest(".animated-checkbox") as HTMLLabelElement;
      if (label) {
        e.preventDefault();
        lastClickedId = label.getAttribute("for");
      }
    };

    const handleAnimationEnd = (e: AnimationEvent) => {
      // Clean up the animating class after bounce completes
      if (e.animationName === "checkbox-bounce") {
        (e.target as Element).closest(".md-line")?.classList.remove("animating");
      }
    };

    const observer = new MutationObserver(() => {
      if (lastClickedId) {
        const input = editor.querySelector(`#${CSS.escape(lastClickedId)}`);
        if (input) {
          const line = input.closest(".md-line");
          if (line) {
            line.classList.add("animating");
            lastClickedId = null; // Mark as handled
          }
        }
      }
    });

    observer.observe(editor, { childList: true, subtree: true });

    editor.addEventListener("pointerdown", handlePointerDown);
    editor.addEventListener("animationend", handleAnimationEnd);

    onCleanup(() => {
      observer.disconnect();
      editor.removeEventListener("pointerdown", handlePointerDown);
      editor.removeEventListener("animationend", handleAnimationEnd);
    });
  });
};
