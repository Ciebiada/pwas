import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import type { MarkdownFoldState } from "../services/markdown/folding";

export type EditorFoldToggleHandle = {
  isFolded: boolean;
  isShowingChildren: boolean;
  sectionId: string;
  top: number;
};

type UseEditorFoldTogglesOptions = {
  foldState: Accessor<MarkdownFoldState>;
  getContainer: () => HTMLElement | undefined;
  getEditor: () => HTMLElement | undefined;
};

export const useEditorFoldToggles = (options: UseEditorFoldTogglesOptions) => {
  const [handle, setHandle] = createSignal<EditorFoldToggleHandle | null>(null);
  let syncFrame: number | undefined;

  const syncHandle = () => {
    if (syncFrame !== undefined) cancelAnimationFrame(syncFrame);
    syncFrame = requestAnimationFrame(() => {
      syncFrame = undefined;
      const container = options.getContainer();
      const editor = options.getEditor();
      if (!container || !editor) {
        setHandle(null);
        return;
      }

      const activeLine = editor.querySelector<HTMLElement>(".md-line.is-active-line");
      const sectionId = activeLine?.getAttribute("data-section-id") ?? null;
      const section = sectionId ? options.foldState().sections.find((s) => s.id === sectionId) : undefined;
      if (!activeLine || !section) {
        setHandle(null);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const rect = activeLine.getBoundingClientRect();
      if (rect.height === 0) {
        setHandle(null);
        return;
      }

      setHandle({
        isFolded: section.isFolded,
        isShowingChildren: section.isShowingChildren,
        sectionId: section.id,
        top: rect.top - containerRect.top + rect.height / 2,
      });
    });
  };

  createEffect(() => {
    options.foldState();
    syncHandle();
  });

  window.addEventListener("resize", syncHandle);

  onCleanup(() => {
    if (syncFrame !== undefined) cancelAnimationFrame(syncFrame);
    window.removeEventListener("resize", syncHandle);
  });

  return {
    handle,
    syncHandle,
  };
};
