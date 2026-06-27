import { useLocation } from "@solidjs/router";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { isIOS } from "ui/platform";

export const useNotesListKeyboardNav = (
  items: () => { id: number }[],
  onOpen: (item: { id: number }) => void,
  onActions: (item: { id: number }) => void,
) => {
  const location = useLocation();
  const [selectedId, setSelectedId] = createSignal<number | null>(null);

  createEffect(() => {
    if (isIOS) return;
    const list = items();
    const id = selectedId();
    if (id === null || !list.some((item) => item.id === id)) {
      setSelectedId(list[0]?.id ?? null);
      return;
    }
    queueMicrotask(() => {
      const el = document.querySelector<HTMLElement>(`.note-item[data-note-id="${id}"]`);
      el?.scrollIntoView({ block: "nearest" });
    });
  });

  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (isIOS) return;
      // Ctrl+P: open actions for the selected note. Runs before the input
      // bail so it works from the editor's contenteditable too.
      if (e.ctrlKey && e.key === "p") {
        e.preventDefault();
        const item = items().find((item) => item.id === selectedId());
        if (item) onActions(item);
        return;
      }
      if (location.pathname !== "/") return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
      const list = items();
      if (list.length === 0) return;
      const currentId = selectedId();
      const currentIdx = currentId === null ? -1 : list.findIndex((item) => item.id === currentId);
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setSelectedId(list[currentIdx < 0 ? 0 : Math.min(currentIdx + 1, list.length - 1)].id);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setSelectedId(list[currentIdx < 0 ? 0 : Math.max(currentIdx - 1, 0)].id);
      } else if (e.key === "Enter" && currentId !== null) {
        const item = list.find((item) => item.id === currentId);
        if (item) {
          e.preventDefault();
          onOpen(item);
        }
      }
    };
    document.addEventListener("keydown", handler);
    onCleanup(() => document.removeEventListener("keydown", handler));
  });

  return selectedId;
};
