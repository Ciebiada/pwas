import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import type { MarkdownFoldState } from "../services/markdown/folding";

const FOLD_TOGGLE_BASELINE_OFFSET_EM = 0.13;
const FOLD_TOGGLE_TEXT_GAP_PX = 4;

export type EditorFoldToggleHandle = {
  isFolded: boolean;
  isShowingChildren: boolean;
  left: number;
  sectionId: string;
  top: number;
};

type UseEditorFoldTogglesOptions = {
  foldState: Accessor<MarkdownFoldState>;
  getContainer: () => HTMLElement | undefined;
  getEditor: () => HTMLElement | undefined;
};

export const useEditorFoldToggles = (options: UseEditorFoldTogglesOptions) => {
  const [handles, setHandles] = createSignal<EditorFoldToggleHandle[]>([]);
  let syncFrame: number | undefined;

  const syncHandles = () => {
    cancelAnimationFrame(syncFrame);
    syncFrame = requestAnimationFrame(() => {
      syncFrame = undefined;
      const container = options.getContainer();
      const editor = options.getEditor();
      if (!container || !editor) {
        setHandles([]);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const lines = Array.from(editor.querySelectorAll<HTMLElement>(".md-line"));
      const nextHandles = options.foldState().sections.flatMap((section): EditorFoldToggleHandle[] => {
        const line = lines[section.lineIndex];
        if (!line) return [];

        const lineRect = line.getBoundingClientRect();
        if (lineRect.height === 0) return [];

        const range = document.createRange();
        range.selectNodeContents(line);
        const textRects = Array.from(range.getClientRects()).filter((rect) => rect.height > 0);
        range.detach();

        const textRect = textRects[textRects.length - 1];
        if (!textRect) return [];

        const fontSize = Number.parseFloat(getComputedStyle(line).fontSize) || 0;
        return [
          {
            isFolded: section.isFolded,
            isShowingChildren: section.isShowingChildren,
            left: textRect.right - containerRect.left + FOLD_TOGGLE_TEXT_GAP_PX,
            sectionId: section.id,
            top: textRect.top - containerRect.top + textRect.height / 2 + fontSize * FOLD_TOGGLE_BASELINE_OFFSET_EM,
          },
        ];
      });

      setHandles(nextHandles);
    });
  };

  createEffect(() => {
    options.foldState();
    syncHandles();
  });

  window.addEventListener("resize", syncHandles);

  onCleanup(() => {
    cancelAnimationFrame(syncFrame);
    window.removeEventListener("resize", syncHandles);
  });

  return {
    handles,
    syncHandles,
  };
};
