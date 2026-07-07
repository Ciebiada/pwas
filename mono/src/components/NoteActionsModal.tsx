import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  type Setter,
  Show,
  untrack,
} from "solid-js";
import { ActionList, ActionListItem } from "ui/ActionList";
import { SearchIcon } from "ui/Icons";
import { Modal, ModalPage, useModal } from "ui/Modal";
import { isIOS } from "ui/platform";
import { useIOSKeyboardFocus } from "ui/useIOSKeyboardFocus";
import { SHEET_ANIMATION_DURATION } from "ui/useSheetDrag";
import { getNoteActions } from "../noteActions";
import type { NoteActionContext, ResolvedNoteAction } from "../noteActions/types";
import { incrementNoteActionUsage } from "../noteActions/usage";
import { db } from "../services/db";
import { searchMatches } from "../services/search";
import { syncNote, wasSynced } from "../services/sync";
import type { EditorAPI } from "./Editor";
import "./NoteActionsModal.css";

type NoteActionsModalProps = {
  noteId: number | null;
  open: Accessor<boolean>;
  setOpen: Setter<boolean>;
  getEditorApi?: () => EditorAPI | undefined;
  onReady?: (api: NoteActionsModalAPI) => void;
  onClose?: () => void;
  onDelete?: () => void | Promise<void>;
};

export type NoteActionsModalAPI = {
  focusSearchOnOpen: () => void;
  openKeyboardForSearch: () => void;
};

const KEYBOARD_OFFSET_THRESHOLD = 80;

const getActionSubtitle = (actionId: string) => {
  switch (actionId) {
    case "title-heading":
      return "Start the line with #";
    case "heading-level-2":
      return "Start the line with ##";
    case "subheading":
      return "Start the line with ###";
    case "bold":
      return "Wrap text with **";
    case "italic":
      return "Wrap text with *";
    case "strikethrough":
      return "Wrap text with ~~";
    case "turn-todo":
      return "Start the line with - [ ]";
    case "turn-bullet":
      return "Start the line with -";
    case "indent-list":
      return "Press Tab on list items";
    case "unindent-list":
      return "Press Shift+Tab on list items";
    case "remove-checked-tasks":
      return "Remove checked - [x] items";
    case "turn-regular":
      return "Remove - or - [ ] prefix";
    case "copy-note":
      return "Copy note to clipboard";
    case "copy-section":
      return "Copy the section under the current header";
    case "select-all":
      return "Select all text";
    case "select-section":
      return "Select the section under the current header";
    default:
      return undefined;
  }
};

export const NoteActionsModal = (props: NoteActionsModalProps) => {
  const [frozenActionContext, setFrozenActionContext] = createSignal<NoteActionContext | null>(null);
  const [canUndo, setCanUndo] = createSignal(false);
  const [canRedo, setCanRedo] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [searchKeyboardRequested, setSearchKeyboardRequested] = createSignal(false);
  const [focusedActionKey, setFocusedActionKey] = createSignal<string | null>(null);
  const [settled, setSettled] = createSignal(false);
  let settledTimer: ReturnType<typeof setTimeout> | undefined;
  let searchInputRef: HTMLInputElement | undefined;
  let hasObservedKeyboardOpen = false;
  let restoreEditorFocusOnClose = false;

  const getKeyboardOffset = () => {
    const viewport = window.visualViewport;
    if (!viewport) return 0;

    return Math.max(0, window.innerHeight - viewport.height);
  };

  const setSearchKeyboardOpen = () => {
    hasObservedKeyboardOpen = hasObservedKeyboardOpen || getKeyboardOffset() >= KEYBOARD_OFFSET_THRESHOLD;
    setSearchKeyboardRequested(true);
  };

  const setSearchKeyboardClosed = () => {
    hasObservedKeyboardOpen = false;
    keyboard.clearTimer();
    setSearchKeyboardRequested(false);
  };

  const keyboard = useIOSKeyboardFocus({
    getTargetInput: () => searchInputRef,
    shouldFocus: () => props.open(),
    onFocus: setSearchKeyboardOpen,
  });

  const closeSearchKeyboardIfBlurred = () => {
    if (!props.open()) return;
    if (keyboard.isEitherFocused()) return;

    setSearchKeyboardClosed();
  };

  const focusSearchOnOpen = () => {
    restoreEditorFocusOnClose = props.getEditorApi?.()?.isFocused() ?? false;
    setSearchKeyboardOpen();
    if (props.open()) {
      keyboard.focusInputSoon();
    }
  };

  const openKeyboardForSearch = () => {
    if (!props.open()) {
      setSearchKeyboardOpen();
    }
    keyboard.focusProxy();
    keyboard.focusInputSoon();
  };

  const handleViewportChange = () => {
    if (!props.open() || !searchKeyboardRequested()) return;
    if (document.activeElement !== searchInputRef) return;

    const keyboardOffset = getKeyboardOffset();
    if (keyboardOffset >= KEYBOARD_OFFSET_THRESHOLD) {
      hasObservedKeyboardOpen = true;
      return;
    }

    if (!hasObservedKeyboardOpen) return;

    setSearchKeyboardClosed();
  };

  onMount(() => {
    props.onReady?.({ focusSearchOnOpen, openKeyboardForSearch });
    window.visualViewport?.addEventListener("resize", handleViewportChange);

    const handler = (e: KeyboardEvent) => {
      if (isIOS) return;
      if (!props.open()) return;
      const keys = visibleActionKeys();
      if (keys.length === 0) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const currentKey = focusedActionKey();
        const currentIdx = currentKey ? keys.indexOf(currentKey) : -1;
        const nextIdx =
          e.key === "ArrowDown"
            ? currentIdx < 0
              ? 0
              : Math.min(currentIdx + 1, keys.length - 1)
            : currentIdx < 0
              ? keys.length - 1
              : Math.max(currentIdx - 1, 0);
        setFocusedActionKey(keys[nextIdx]);
      } else if (e.key === "Enter") {
        const focused = document.querySelector<HTMLButtonElement>(".action-list-item.action-list-item-focused");
        if (focused) {
          e.preventDefault();
          focused.click();
        }
      }
    };
    document.addEventListener("keydown", handler);
    onCleanup(() => document.removeEventListener("keydown", handler));
  });

  onCleanup(() => {
    window.visualViewport?.removeEventListener("resize", handleViewportChange);
  });

  const handleSearchPress = (event: MouseEvent | TouchEvent | PointerEvent) => {
    event.stopPropagation();
    if (document.activeElement === searchInputRef) {
      setSearchKeyboardOpen();
      return;
    }

    event.preventDefault();
    openKeyboardForSearch();
  };

  const handleSearchBlur = (event: FocusEvent) => {
    if (event.relatedTarget instanceof HTMLElement && event.relatedTarget.closest(".action-list-item")) return;

    window.setTimeout(() => {
      closeSearchKeyboardIfBlurred();
    }, 0);
  };

  const readCurrentActionContext = () => {
    const editorApi = props.getEditorApi?.();
    if (!editorApi) return null;
    if (props.noteId === null) return null;

    const state = editorApi.getState();
    return {
      noteId: props.noteId,
      content: state.content,
      selection: state.selection,
    };
  };

  createEffect(() => {
    const isOpen = props.open();

    if (isOpen) {
      untrack(() => {
        const editorApi = props.getEditorApi?.();
        const state = editorApi?.getState();
        setSearchQuery("");
        setFrozenActionContext(readCurrentActionContext());
        setCanUndo(state?.canUndo ?? false);
        setCanRedo(state?.canRedo ?? false);
        if (searchKeyboardRequested()) {
          keyboard.focusInputSoon();
        }
        setFocusedActionKey(null);
        setSettled(false);
        clearTimeout(settledTimer);
        settledTimer = setTimeout(() => setSettled(true), SHEET_ANIMATION_DURATION);
      });
    } else {
      untrack(() => {
        clearTimeout(settledTimer);
        setSettled(false);
        setFrozenActionContext(null);
        setCanUndo(false);
        setCanRedo(false);
        setSearchQuery("");
        setSearchKeyboardClosed();
      });
    }
  });

  const getActionContext = () => frozenActionContext() ?? readCurrentActionContext();

  const actionItems = createMemo(() => {
    const context = getActionContext();
    return context ? getNoteActions(context) : [];
  });

  const matchesSearch = (value: string) => searchMatches(value, searchQuery());
  const showUndo = createMemo(() => canUndo() && matchesSearch("Undo undo"));
  const showRedo = createMemo(() => canRedo() && matchesSearch("Redo redo"));
  const showDelete = createMemo(() => matchesSearch("Delete Note delete"));
  const filteredActionItems = createMemo(() =>
    actionItems().filter((item) => matchesSearch(`${item.label} ${item.action.icon ?? ""}`)),
  );
  const hasVisibleActions = createMemo(
    () => showUndo() || showRedo() || filteredActionItems().length > 0 || showDelete(),
  );

  // Ordered keys for keyboard navigation. Matches the render order in ActionRows
  // so the visual order and the Up/Down cursor agree.
  const visibleActionKeys = createMemo(() => {
    const keys: string[] = [];
    if (showUndo()) keys.push("undo");
    if (showRedo()) keys.push("redo");
    for (const item of filteredActionItems()) keys.push(item.action.id);
    if (showDelete()) keys.push("delete");
    return keys;
  });

  // Clamp the focused key: if the current focus is missing from the visible
  // list (filter changed, modal just opened), snap to the first item.
  createEffect(() => {
    if (isIOS) return;
    const keys = visibleActionKeys();
    const key = focusedActionKey();
    if (key === null) {
      if (keys.length > 0) setFocusedActionKey(keys[0]);
      return;
    }
    if (!keys.includes(key) && keys.length > 0) setFocusedActionKey(keys[0]);
  });

  // Scroll the focused action into view as the cursor moves.
  createEffect(() => {
    const key = focusedActionKey();
    if (key === null) return;
    if (!settled()) return;
    queueMicrotask(() => {
      const el = document.querySelector<HTMLElement>(`.action-list-item.${CSS.escape(`note-action-${key}`)}`);
      el?.scrollIntoView({ block: "nearest" });
    });
  });

  const handleAction =
    ({ action, context }: ResolvedNoteAction) =>
    async (close: (fast?: boolean) => Promise<void>) => {
      const editorApi = props.getEditorApi?.();
      if (!editorApi) return;
      if (!action.isApplicable(context)) return;

      // Note actions are synchronous: apply the edit and refocus the editor
      // within the tap gesture and *before* closing the modal. iOS only shows and
      // keeps the keyboard for an in-gesture focus, and applying before the modal
      // closes (and before the user can type) prevents the edit from clobbering
      // early keystrokes. A Promise result (allowed by the type) falls back to the
      // post-await path.
      const ran = action.run(context);
      const result = ran instanceof Promise ? await ran : ran;

      incrementNoteActionUsage(action.id);
      if (!result) {
        await close(true);
        return;
      }

      editorApi.focus();
      editorApi.applyEdit(result);
      await close(true);
    };

  const handleUndo = async (close: (fast?: boolean) => Promise<void>) => {
    const editorApi = props.getEditorApi?.();
    if (!editorApi?.getState().canUndo) return;

    editorApi.focus();
    editorApi.undo();
    await close(true);
  };

  const handleRedo = async (close: (fast?: boolean) => Promise<void>) => {
    const editorApi = props.getEditorApi?.();
    if (!editorApi?.getState().canRedo) return;

    editorApi.focus();
    editorApi.redo();
    await close(true);
  };

  const handleDelete = async (close: () => Promise<void>) => {
    const noteId = props.noteId;
    if (noteId === null) return;
    await close();
    const note = await db.notes.get(noteId);
    if (!note) return;

    if (wasSynced(note)) {
      await db.notes.update(noteId, { status: "pending-delete" });
      syncNote(noteId);
    } else {
      await db.notes.delete(noteId);
    }

    await props.onDelete?.();
  };

  // Restore editor focus synchronously while the close gesture is still active
  // so iOS keeps the keyboard up. Running this after the close animation (in
  // onClose) leaves the caret visible but the keyboard dismissed.
  const handleModalCloseStart = () => {
    if (!restoreEditorFocusOnClose) return;
    restoreEditorFocusOnClose = false;
    props.getEditorApi?.()?.focus();
  };

  const ActionRows = () => {
    const { close } = useModal();

    return (
      <ActionList>
        <Show when={showUndo()}>
          <ActionListItem
            title="Undo"
            subtitle="Revert the last edit"
            class="note-action-undo"
            focused={focusedActionKey() === "undo"}
            onClick={() => void handleUndo(close)}
          />
        </Show>
        <Show when={showRedo()}>
          <ActionListItem
            title="Redo"
            subtitle="Reapply the last edit"
            class="note-action-redo"
            focused={focusedActionKey() === "redo"}
            onClick={() => void handleRedo(close)}
          />
        </Show>
        <For each={filteredActionItems()}>
          {(item) => (
            <ActionListItem
              title={item.label}
              subtitle={getActionSubtitle(item.action.id)}
              class={`note-action-${item.action.id}`}
              focused={focusedActionKey() === item.action.id}
              disabled={!item.isAvailable}
              onClick={() => void handleAction(item)(close)}
            />
          )}
        </For>
        <Show when={showDelete()}>
          <ActionListItem
            title="Delete Note"
            subtitle="Remove this note"
            class="note-action-delete"
            danger
            focused={focusedActionKey() === "delete"}
            onClick={() => void handleDelete(close)}
          />
        </Show>
      </ActionList>
    );
  };

  return (
    <>
      <input
        ref={keyboard.proxyRef}
        class="note-actions-search-focus-proxy"
        type="search"
        aria-hidden="true"
        autocorrect="off"
        autocapitalize="on"
        tabindex="-1"
      />
      <Modal
        open={props.open}
        setOpen={props.setOpen}
        title="Note Actions"
        restingHeightRatio={isIOS && searchKeyboardRequested() ? 0.85 : 0.5}
        header={
          <label class="note-actions-search" onMouseDown={handleSearchPress} onTouchStart={handleSearchPress}>
            <span class="note-actions-search-icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              ref={searchInputRef}
              type="search"
              class="note-actions-search-input"
              value={searchQuery()}
              placeholder="Search actions"
              aria-label="Search actions"
              // No autocorrection on the action filter: while iOS shows an
              // autocorrect suggestion for the typed word, it consumes the next
              // tap to commit/dismiss it, eating the first tap on an action.
              autocorrect="off"
              autocapitalize="on"
              onFocus={setSearchKeyboardOpen}
              onBlur={handleSearchBlur}
              onInput={(e) => {
                setSearchQuery(e.currentTarget.value);
                setFocusedActionKey(null);
              }}
            />
          </label>
        }
        onCloseStart={handleModalCloseStart}
        onClose={props.onClose}
      >
        <ModalPage id="root">
          <Show when={hasVisibleActions()} fallback={<div class="note-actions-empty">No actions found</div>}>
            <ActionRows />
          </Show>
        </ModalPage>
      </Modal>
    </>
  );
};
