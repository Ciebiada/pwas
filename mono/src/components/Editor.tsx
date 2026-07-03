import { createMemo, createSignal, mergeProps, onMount, Show } from "solid-js";
import { isIOS } from "ui/platform";
import { useEditorHistory } from "../hooks/useEditorHistory";
import { useEditorLineReorder } from "../hooks/useEditorLineReorder";
import { useEditorSelectionPresentation } from "../hooks/useEditorSelectionPresentation";
import { useIOSKeyboardDismiss } from "../hooks/useIOSKeyboardDismiss";
import { useIOSKeyboardHeightScroll } from "../hooks/useIOSKeyboardHeightScroll";
import { usePrettyCaret } from "../hooks/usePrettyCaret";
import { usePrettyCheckboxes } from "../hooks/usePrettyCheckboxes";
import { useWikiLinkCompletion } from "../hooks/useWikiLinkCompletion";
import {
  calculateCursorPosition,
  getSelection,
  scrollCursorIntoView,
  scrollWhenViewportStable,
  setSelection,
} from "../services/cursor";
import { processBeforeInput } from "../services/editorInput";
import { toggleCheckbox } from "../services/markdown/features/todoList";
import { handleTab } from "../services/markdown/input";
import { EditorContent } from "../services/markdown/renderer";
import { splitNote } from "../services/note";
import {
  getNoteBackground,
  isMonospaceEnabled,
  isPrettyCaretEnabled,
  isPrettyCheckboxesEnabled,
} from "../services/preferences";
import { TouchHint } from "./TouchHint";
import { WikiLinkCompletionMenu } from "./WikiLinkCompletionMenu";
import "./Editor.css";

export type EditorSelection = {
  start: number;
  end: number;
};

export type EditorEdit = {
  content: string;
  selection?: EditorSelection;
};

export type EditorState = {
  content: string;
  selection: EditorSelection;
  canRedo: boolean;
  canUndo: boolean;
};

export type EditorAPI = {
  focus: () => void;
  isFocused: () => boolean;
  replaceContent: (name: string, content: string) => void;
  getState: () => EditorState;
  applyEdit: (edit: EditorEdit) => void;
  redo: () => void;
  undo: () => void;
};

type EditorProps = {
  initialContent: string;
  initialCursor?: number;
  autoFocus?: boolean;
  onReady?: (api: EditorAPI) => void;
  onChange?: (name: string, content: string) => void;
  onCursorChange?: (cursor: number) => void;
  getWikiLinkSuggestions?: (query: string) => string[] | Promise<string[]>;
  onWikiLinkOpen?: (title: string, href: string) => void;
  getWikiLinkHref?: (title: string) => string;
};

export const Editor = (_props: EditorProps) => {
  const props = mergeProps({ initialCursor: 0 }, _props);
  const [content, setContent] = createSignal(props.initialContent);
  const isEmpty = createMemo(() => {
    const { name, content: body } = splitNote(content());
    return name.trim().length === 0 && body.trim().length === 0;
  });

  let editor: HTMLDivElement;
  let container: HTMLDivElement | undefined;
  let iosReplacementText = "";
  let suppressNextFocusScroll = false;
  let lastSelection: EditorSelection = {
    start: props.initialCursor,
    end: props.initialCursor,
  };
  let syncLineReorderHandle = () => {};
  let syncPrettyCaret = () => {};
  let isLineReordering = () => false;
  let refreshWikiCompletionHandle = (_selection?: EditorSelection) => {};
  let closeWikiCompletionHandle = () => {};
  if (isPrettyCaretEnabled()) {
    const prettyCaret = usePrettyCaret(
      () => container,
      () => editor,
    );
    syncPrettyCaret = prettyCaret.sync;
  }

  if (isPrettyCheckboxesEnabled()) {
    usePrettyCheckboxes(() => editor);
  }

  const selectionPresentation = useEditorSelectionPresentation({
    getEditor: () => editor,
    isIOS,
    onSelectionChange: (selection) => {
      lastSelection = selection;
      props.onCursorChange?.(selection.start);
      syncLineReorderHandle();
      refreshWikiCompletionHandle(selection);
    },
  });

  const syncSelectionPresentation = () => {
    selectionPresentation.sync();
    syncLineReorderHandle();
  };

  const { ignoreNextBlurForReorder: ignoreIOSKeyboardBlurForReorder } = useIOSKeyboardDismiss({
    isIOS,
    getEditor: () => editor,
    isReordering: () => isLineReordering(),
    onDismiss: () => {
      editor.blur();
      syncSelectionPresentation();
    },
  });

  const { recordBaseline: recordKeyboardBaseline } = useIOSKeyboardHeightScroll(() => editor);

  const handleEditorBlur = () => {
    syncSelectionPresentation();
    closeWikiCompletionHandle();
  };

  const emitChange = () => {
    const { name, content: noteContent } = splitNote(content());
    props.onChange?.(name, noteContent);
  };

  const getCurrentSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return lastSelection;

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return lastSelection;

    return getSelection(editor);
  };

  const applySelection = (selection: EditorSelection) => {
    lastSelection = selection;
    const appliedSelection = setSelection(editor, selection.start, { end: selection.end });
    syncPrettyCaret();
    return appliedSelection;
  };

  const toSelection = (selection: number | EditorSelection): EditorSelection =>
    typeof selection === "number"
      ? {
          start: selection,
          end: selection,
        }
      : selection;

  const applyContent = (newContent: string, selection: number | EditorSelection, scroll = true) => {
    const nextSelection = toSelection(selection);

    setContent(newContent);
    applySelection(nextSelection);
    syncSelectionPresentation();
    emitChange();
    if (scroll) {
      requestAnimationFrame(() => {
        scrollCursorIntoView(window.getSelection()!, "smooth");
      });
    }
    refreshWikiCompletionHandle(nextSelection);
  };

  const history = useEditorHistory({
    getState: () => ({
      content: content(),
      selection: getCurrentSelection(),
    }),
    applyState: (state) => applyContent(state.content, state.selection),
  });

  const applyEdit = (newContent: string, selection: number | EditorSelection, inputType?: string) => {
    const nextSelection = toSelection(selection);
    history.record(newContent, inputType, nextSelection);
    applyContent(newContent, nextSelection, inputType !== "insertWikiLink");
  };

  const wikiCompletion = useWikiLinkCompletion({
    applyEdit,
    content,
    getEditor: () => editor,
    getSuggestions: props.getWikiLinkSuggestions,
  });
  refreshWikiCompletionHandle = wikiCompletion.refresh;
  closeWikiCompletionHandle = wikiCompletion.close;

  const applyLineReorderEdit = (edit: { content: string; selection: EditorSelection }) => {
    if (isIOS) ignoreIOSKeyboardBlurForReorder();
    history.record(edit.content, "reorderLine", edit.selection);
    setContent(edit.content);
    suppressNextFocusScroll = true;
    editor.focus({ preventScroll: true });
    suppressNextFocusScroll = false;
    applySelection(edit.selection);
    syncSelectionPresentation();
    requestAnimationFrame(() => {
      scrollCursorIntoView(window.getSelection()!, "smooth");
    });

    emitChange();
  };

  const lineReorder = useEditorLineReorder({
    applyEdit: applyLineReorderEdit,
    content,
    getContainer: () => container,
    getCursor: () => getCurrentSelection().start,
    getEditor: () => editor,
  });
  syncLineReorderHandle = lineReorder.syncHandle;
  isLineReordering = () => lineReorder.indicator() !== null;

  onMount(() => {
    props.onReady?.({
      focus: () => {
        suppressNextFocusScroll = true;
        editor.focus({ preventScroll: true });
        suppressNextFocusScroll = false;
        applySelection(lastSelection);
        syncSelectionPresentation();
      },
      isFocused: () => document.activeElement === editor,
      getState: () => ({
        content: content(),
        selection: lastSelection,
        canRedo: history.canRedo(),
        canUndo: history.canUndo(),
      }),
      applyEdit: (edit) => {
        applyEdit(edit.content, edit.selection ?? lastSelection);
      },
      replaceContent: (name: string, noteContent: string) => {
        const newContent = name + (noteContent ? `\n${noteContent}` : "");
        const { start } = getSelection(editor);
        const newCursor = calculateCursorPosition(content(), newContent, start);

        history.reset();
        setContent(newContent);
        closeWikiCompletionHandle();
        requestAnimationFrame(() => {
          applySelection({
            start: newCursor,
            end: newCursor,
          });
          syncSelectionPresentation();
        });
      },
      redo: () => history.redo(),
      undo: () => history.undo(),
    });

    const selection = applySelection({
      start: props.initialCursor,
      end: props.initialCursor,
    });
    if (selection) scrollCursorIntoView(selection, "instant");

    if (props.autoFocus && !isIOS) {
      editor.focus();
      syncSelectionPresentation();
    } else {
      // This is to blur the forced focus after the initialCursor position has been set
      editor.blur();
      syncSelectionPresentation();
    }
  });

  const onTextInput = (event: InputEvent) => (iosReplacementText = event.data || "");

  const handleKeyDown = (event: KeyboardEvent) => {
    if (wikiCompletion.handleKeyDown(event)) return;

    if (event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "y") {
      event.preventDefault();
      history.redo();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.altKey) {
      event.preventDefault();
      if (event.shiftKey) {
        history.redo();
      } else {
        history.undo();
      }
      return;
    }

    if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const result = handleTab(content(), getSelection(editor), event.shiftKey);
      applyEdit(result.content, result.selection ?? result.cursor, "insertTab");
      return;
    }

    if (selectionPresentation.handleKeyDown(event)) {
      event.preventDefault();
      return;
    }
  };

  const handleBeforeInput = (event: InputEvent) => {
    event.preventDefault();

    const selection = getSelection(editor);
    const result = processBeforeInput(event.inputType, content(), selection, {
      eventData: event.inputType === "insertFromPaste" ? event.dataTransfer?.getData("text/plain") : event.data,
      iosReplacementText,
    });

    if (result) {
      applyEdit(result.content, result.cursor, event.inputType);
    }
  };

  const handleCheckboxToggle = (lineIndex: number) => {
    const selection = getCurrentSelection();
    const nextSelection = {
      start: selection.start,
      end: selection.start,
    };
    const newContent = toggleCheckbox(content(), lineIndex);

    history.record(newContent, "toggleCheckbox", nextSelection);
    setContent(newContent);
    if (document.activeElement === editor) {
      applySelection(nextSelection);
      syncSelectionPresentation();
    }
    emitChange();
  };

  const copySelectionToClipboard = (event: ClipboardEvent): EditorSelection | null => {
    const selection = getSelection(editor);
    if (selection.start === selection.end) return null;

    event.clipboardData?.setData("text/plain", content().slice(selection.start, selection.end));
    return selection;
  };

  const handleCopy = (event: ClipboardEvent) => {
    event.preventDefault();
    copySelectionToClipboard(event);
  };

  const handleCut = (event: ClipboardEvent) => {
    event.preventDefault();
    const selection = copySelectionToClipboard(event);
    if (!selection) return;

    const result = processBeforeInput("deleteByCut", content(), selection, {});
    if (result) {
      applyEdit(result.content, result.cursor, "deleteByCut");
    }
  };

  return (
    <div class="editor-container" ref={container}>
      <div
        ref={(e) => (editor = e)}
        classList={{
          editor: true,
          "is-line-reordering": lineReorder.indicator() !== null,
          monospace: isMonospaceEnabled(),
          "pretty-checkboxes": isPrettyCheckboxesEnabled(),
          "dot-grid": getNoteBackground() === "dot-grid",
        }}
        contentEditable={true}
        spellcheck={false}
        onFocus={() => {
          if (suppressNextFocusScroll) {
            suppressNextFocusScroll = false;
            return;
          }
          editor.focus({ preventScroll: true });
          syncSelectionPresentation();
          scrollWhenViewportStable(() => {
            scrollCursorIntoView(window.getSelection()!, "smooth");
            recordKeyboardBaseline();
          });
        }}
        onBlur={handleEditorBlur}
        onBeforeInput={handleBeforeInput}
        onKeyDown={handleKeyDown}
        on:textInput={onTextInput}
        onCopy={handleCopy}
        onCut={handleCut}
      >
        <EditorContent
          content={content}
          onCheckboxToggle={handleCheckboxToggle}
          wikiLinkHandlers={{
            onClick: props.onWikiLinkOpen,
            getHref: props.getWikiLinkHref,
          }}
        />
      </div>
      <WikiLinkCompletionMenu
        visible={wikiCompletion.isOpen}
        options={wikiCompletion.options}
        selectedIndex={wikiCompletion.selectedIndex}
        position={wikiCompletion.position}
        setRef={wikiCompletion.setMenuRef}
        onSelect={wikiCompletion.accept}
      />
      <Show when={lineReorder.handle()}>
        {(handle) => (
          <button
            type="button"
            class="line-reorder-handle"
            style={{ top: `${handle().top}px` }}
            aria-label="Reorder line"
            title="Reorder line"
            onPointerDown={lineReorder.onHandlePointerDown}
          />
        )}
      </Show>
      <Show when={lineReorder.indicator()}>
        {(indicator) => (
          <div
            class="line-reorder-drop-indicator"
            classList={{ "is-move": indicator().isMove }}
            style={{ top: `${indicator().top}px` }}
            contentEditable={false}
          />
        )}
      </Show>
      <TouchHint isVisible={isEmpty()} />
    </div>
  );
};
