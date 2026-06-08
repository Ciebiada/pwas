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
import { getApplicableNoteActions } from "../noteActions";
import type { NoteActionContext, ResolvedNoteAction } from "../noteActions/types";
import { incrementNoteActionUsage } from "../noteActions/usage";
import { db } from "../services/db";
import { syncNote, wasSynced } from "../services/sync";
import type { EditorAPI } from "./Editor";
import "./NoteActionsModal.css";

type NoteActionsModalProps = {
  noteId: number;
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

const normalizeSearchText = (value: string) => value.trim().toLowerCase();

const searchMatches = (value: string, query: string) => {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const normalizedValue = normalizeSearchText(value);
  const valueTokens = normalizedValue.split(/[^a-z0-9#]+/).filter(Boolean);

  return tokens.every(
    (token) => normalizedValue.includes(token) || valueTokens.some((value) => value.startsWith(token)),
  );
};

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
    case "toggle-fold":
      return "Cycle all heading sections";
    case "fold-all-sections":
      return "Collapse all heading sections";
    case "unfold-all-sections":
      return "Expand all heading sections";
    default:
      return undefined;
  }
};

export const NoteActionsModal = (props: NoteActionsModalProps) => {
  const [frozenActionContext, setFrozenActionContext] = createSignal<NoteActionContext | null>(null);
  const [canUndo, setCanUndo] = createSignal(false);
  const [canRedo, setCanRedo] = createSignal(false);
  const [canFoldAllSections, setCanFoldAllSections] = createSignal(false);
  const [canUnfoldAllSections, setCanUnfoldAllSections] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [searchKeyboardRequested, setSearchKeyboardRequested] = createSignal(false);
  let searchInputRef: HTMLInputElement | undefined;
  let focusProxyRef: HTMLInputElement | undefined;
  let focusSearchInputTimer: number | undefined;
  let hasObservedKeyboardOpen = false;
  let restoreEditorFocusOnClose = false;

  const clearFocusSearchInputTimer = () => {
    if (focusSearchInputTimer !== undefined) {
      window.clearTimeout(focusSearchInputTimer);
      focusSearchInputTimer = undefined;
    }
  };

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
    clearFocusSearchInputTimer();
    setSearchKeyboardRequested(false);
  };

  const focusSearchInput = () => {
    setSearchKeyboardOpen();
    searchInputRef?.focus({ preventScroll: true });
  };

  const focusSearchInputSoon = () => {
    clearFocusSearchInputTimer();

    requestAnimationFrame(() => {
      if (!props.open()) return;

      focusSearchInputTimer = window.setTimeout(() => {
        focusSearchInputTimer = undefined;
        if (!props.open()) return;

        focusSearchInput();
      }, 0);
    });
  };

  const focusSearchOnOpen = () => {
    restoreEditorFocusOnClose = props.getEditorApi?.()?.isFocused() ?? false;
    setSearchKeyboardOpen();
    if (props.open()) {
      focusSearchInputSoon();
    }
  };

  const openKeyboardForSearch = () => {
    if (!props.open()) {
      setSearchKeyboardOpen();
    }
    clearFocusSearchInputTimer();
    focusProxyRef?.focus({ preventScroll: true });
    focusSearchInputSoon();
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
  });

  onCleanup(() => {
    clearFocusSearchInputTimer();
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

  const handleSearchBlur = () => {
    window.setTimeout(() => {
      if (!props.open()) return;
      if (document.activeElement === searchInputRef || document.activeElement === focusProxyRef) return;

      setSearchKeyboardClosed();
    }, 0);
  };

  const readCurrentActionContext = () => {
    const editorApi = props.getEditorApi?.();
    if (!editorApi) return null;

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
        setCanFoldAllSections(editorApi?.canFoldAllSections() ?? false);
        setCanUnfoldAllSections(editorApi?.canUnfoldAllSections() ?? false);
        if (searchKeyboardRequested()) {
          focusSearchInputSoon();
        }
      });
    } else {
      untrack(() => {
        if (restoreEditorFocusOnClose && searchKeyboardRequested()) {
          props.getEditorApi?.()?.focus();
        }
        restoreEditorFocusOnClose = false;
        clearFocusSearchInputTimer();
        setFrozenActionContext(null);
        setCanUndo(false);
        setCanRedo(false);
        setCanFoldAllSections(false);
        setCanUnfoldAllSections(false);
        setSearchQuery("");
        setSearchKeyboardRequested(false);
      });
    }
  });

  const getActionContext = () => frozenActionContext() ?? readCurrentActionContext();

  const actionItems = createMemo(() => {
    const context = getActionContext();
    return context ? getApplicableNoteActions(context) : [];
  });

  const matchesSearch = (value: string) => searchMatches(value, searchQuery());
  const showUndo = createMemo(() => canUndo() && matchesSearch("Undo undo"));
  const showRedo = createMemo(() => canRedo() && matchesSearch("Redo redo"));
  const showToggleFold = createMemo(
    () => (canFoldAllSections() || canUnfoldAllSections()) && matchesSearch("Toggle Fold fold Ctrl O outline"),
  );
  const showFoldAllSections = createMemo(() => canFoldAllSections() && matchesSearch("Fold All Sections fold"));
  const showUnfoldAllSections = createMemo(() => canUnfoldAllSections() && matchesSearch("Unfold All Sections unfold"));
  const showDelete = createMemo(() => matchesSearch("Delete Note delete"));
  const filteredActionItems = createMemo(() =>
    actionItems().filter((item) => matchesSearch(`${item.label} ${item.action.icon ?? ""}`)),
  );
  const hasVisibleActions = createMemo(
    () =>
      showUndo() ||
      showRedo() ||
      showToggleFold() ||
      showFoldAllSections() ||
      showUnfoldAllSections() ||
      filteredActionItems().length > 0 ||
      showDelete(),
  );

  const handleAction =
    ({ action, context }: ResolvedNoteAction) =>
    async (close: (fast?: boolean) => Promise<void>) => {
      const editorApi = props.getEditorApi?.();
      if (!editorApi) return;
      if (!action.isApplicable(context)) return;

      const result = await action.run(context);
      if (!result) return;

      incrementNoteActionUsage(action.id);
      editorApi.focus();
      editorApi.applyEdit(result);
      void close(true);
    };

  const handleUndo = async (close: (fast?: boolean) => Promise<void>) => {
    const editorApi = props.getEditorApi?.();
    if (!editorApi?.getState().canUndo) return;

    editorApi.undo();
    void close(true);
  };

  const handleRedo = async (close: (fast?: boolean) => Promise<void>) => {
    const editorApi = props.getEditorApi?.();
    if (!editorApi?.getState().canRedo) return;

    editorApi.redo();
    void close(true);
  };

  const handleToggleFold = (close: (fast?: boolean) => Promise<void>) => {
    const editorApi = props.getEditorApi?.();
    if (!editorApi) return;
    if (!editorApi.canFoldAllSections() && !editorApi.canUnfoldAllSections()) return;

    void close(true);
    editorApi.cycleFoldSections();
  };

  const handleFoldAllSections = (close: (fast?: boolean) => Promise<void>) => {
    const editorApi = props.getEditorApi?.();
    if (!editorApi?.canFoldAllSections()) return;

    void close(true);
    editorApi.foldAllSections();
  };

  const handleUnfoldAllSections = (close: (fast?: boolean) => Promise<void>) => {
    const editorApi = props.getEditorApi?.();
    if (!editorApi?.canUnfoldAllSections()) return;

    void close(true);
    editorApi.unfoldAllSections();
  };

  const handleDelete = async (close: () => Promise<void>) => {
    await close();
    const note = await db.notes.get(props.noteId);
    if (!note) return;

    if (wasSynced(note)) {
      await db.notes.update(props.noteId, { status: "pending-delete" });
      syncNote(props.noteId);
    } else {
      await db.notes.delete(props.noteId);
    }

    await props.onDelete?.();
  };

  const ActionRows = () => {
    const { close } = useModal();

    return (
      <ActionList>
        <Show when={showUndo()}>
          <ActionListItem title="Undo" subtitle="Revert the last edit" onClick={() => void handleUndo(close)} />
        </Show>
        <Show when={showRedo()}>
          <ActionListItem title="Redo" subtitle="Reapply the last edit" onClick={() => void handleRedo(close)} />
        </Show>
        <Show when={showToggleFold()}>
          <ActionListItem
            title="Toggle Fold"
            subtitle={getActionSubtitle("toggle-fold")}
            class="note-action-toggle-fold"
            onClick={() => void handleToggleFold(close)}
          />
        </Show>
        <Show when={showFoldAllSections()}>
          <ActionListItem
            title="Fold All Sections"
            subtitle={getActionSubtitle("fold-all-sections")}
            class="note-action-fold-all-sections"
            onClick={() => void handleFoldAllSections(close)}
          />
        </Show>
        <Show when={showUnfoldAllSections()}>
          <ActionListItem
            title="Unfold All Sections"
            subtitle={getActionSubtitle("unfold-all-sections")}
            class="note-action-unfold-all-sections"
            onClick={() => void handleUnfoldAllSections(close)}
          />
        </Show>
        <For each={filteredActionItems()}>
          {(item) => (
            <ActionListItem
              title={item.label}
              subtitle={getActionSubtitle(item.action.id)}
              class={`note-action-${item.action.id}`}
              onClick={() => void handleAction(item)(close)}
            />
          )}
        </For>
        <Show when={showDelete()}>
          <ActionListItem
            title="Delete Note"
            subtitle="Remove this note"
            danger
            onClick={() => void handleDelete(close)}
          />
        </Show>
      </ActionList>
    );
  };

  return (
    <>
      <input
        ref={focusProxyRef}
        class="note-actions-search-focus-proxy"
        type="search"
        aria-hidden="true"
        autocomplete="off"
        tabindex="-1"
      />
      <Modal
        open={props.open}
        setOpen={props.setOpen}
        title="Note Actions"
        restingHeightRatio={searchKeyboardRequested() ? 0.75 : 0.5}
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
              onFocus={setSearchKeyboardOpen}
              onBlur={handleSearchBlur}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
            />
          </label>
        }
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
