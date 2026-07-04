import { useLocation } from "@solidjs/router";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { isIOS } from "ui/platform";

export const useNotesListKeyboardNav = (
  items: () => { id: number }[],
  hasCreateItem: () => boolean,
  searchBarFocused: () => boolean,
  onOpen: (item: { id: number }) => void,
  onActions: (item: { id: number }) => void,
  onCreate: () => void,
) => {
  const location = useLocation();
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  // When true, the keyboard cursor sits on the trailing "create" row rather than
  // any note. selectedId is null in that case.
  const [createSelected, setCreateSelected] = createSignal(false);

  createEffect(() => {
    const list = items();
    const showCreate = hasCreateItem();
    const id = selectedId();
    const create = createSelected();

    if (isIOS) {
      // No arrow-nav on iOS: the indicator only makes sense while the search
      // bar is focused and Enter can confirm. Auto-select the first result (or
      // the create row when there are none) then; otherwise keep the list clear.
      if (!searchBarFocused()) {
        if (id !== null) setSelectedId(null);
        if (create) setCreateSelected(false);
        return;
      }
      if (list.length > 0) {
        if (id !== list[0].id) setSelectedId(list[0].id);
        if (create) setCreateSelected(false);
      } else if (showCreate) {
        if (!create) setCreateSelected(true);
        if (id !== null) setSelectedId(null);
      } else {
        if (id !== null) setSelectedId(null);
        if (create) setCreateSelected(false);
      }
      return;
    }

    // Create row selected but no longer shown -> fall back to the first note.
    if (create && !showCreate) {
      setCreateSelected(false);
      setSelectedId(list[0]?.id ?? null);
      return;
    }
    // Note selected but missing from the list, or nothing selected -> reselect.
    if (!create && (id === null || !list.some((item) => item.id === id))) {
      if (list.length > 0) {
        setSelectedId(list[0].id);
        setCreateSelected(false);
      } else if (showCreate) {
        setSelectedId(null);
        setCreateSelected(true);
      } else {
        setSelectedId(null);
        setCreateSelected(false);
      }
      return;
    }
    if (!create && id !== null) {
      queueMicrotask(() => {
        const el = document.querySelector<HTMLElement>(`.note-item[data-note-id="${id}"]`);
        el?.scrollIntoView({ block: "nearest" });
      });
    } else if (create) {
      queueMicrotask(() => {
        document.querySelector<HTMLElement>(".create-note-item")?.scrollIntoView({ block: "nearest" });
      });
    }
  });

  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+P: open actions for the selected note. Runs before the input
      // bail so it works from the editor's contenteditable too. Desktop only.
      if (!isIOS && e.ctrlKey && e.key === "p") {
        e.preventDefault();
        const item = items().find((item) => item.id === selectedId());
        if (item) onActions(item);
        return;
      }
      if (location.pathname !== "/") return;
      const target = e.target as HTMLElement | null;
      const isSearchInput = target?.classList.contains("notes-search-input") ?? false;
      if (isIOS) {
        // Only the search input's Enter is handled (confirm the auto-selected
        // result or the create row). No arrow-nav on iOS.
        if (e.key !== "Enter" || !isSearchInput) return;
      } else {
        const isSearchNavKey = e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter";
        if (
          target &&
          !isSearchInput &&
          (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        ) {
          return;
        }
        if (isSearchInput && !isSearchNavKey) return;
      }
      const list = items();
      const showCreate = hasCreateItem();
      if (list.length === 0 && !showCreate) return;

      const create = createSelected();
      const currentId = selectedId();

      if (e.key === "Enter") {
        if (create) {
          e.preventDefault();
          onCreate();
        } else if (currentId !== null) {
          const item = list.find((item) => item.id === currentId);
          if (item) {
            e.preventDefault();
            onOpen(item);
          }
        }
        return;
      }

      // Arrow nav — desktop only (iOS returns above for any non-Enter key).
      const currentIdx = !create && currentId !== null ? list.findIndex((item) => item.id === currentId) : -1;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        if (create) return;
        const nextIdx = currentIdx < 0 ? 0 : currentIdx + 1;
        if (nextIdx >= list.length) {
          if (showCreate) {
            setCreateSelected(true);
            setSelectedId(null);
          }
        } else {
          setCreateSelected(false);
          setSelectedId(list[nextIdx].id);
        }
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        if (create) {
          if (list.length > 0) {
            setCreateSelected(false);
            setSelectedId(list[list.length - 1].id);
          }
          return;
        }
        const nextIdx = currentIdx < 0 ? 0 : Math.max(currentIdx - 1, 0);
        setCreateSelected(false);
        setSelectedId(list[nextIdx].id);
      }
    };
    document.addEventListener("keydown", handler);
    onCleanup(() => document.removeEventListener("keydown", handler));
  });

  return { selectedId, createSelected };
};
