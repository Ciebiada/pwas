import { createMemo, createSignal, mergeProps, onMount } from "solid-js";
import { isIOS } from "ui/platform";
import { useEditorFolding } from "../hooks/useEditorFolding";
import { useEditorHistory } from "../hooks/useEditorHistory";
import { useEditorLineReorder } from "../hooks/useEditorLineReorder";
import { useEditorSelectionPresentation } from "../hooks/useEditorSelectionPresentation";
import { usePrettyCaret } from "../hooks/usePrettyCaret";
import { usePrettyCheckboxes } from "../hooks/usePrettyCheckboxes";
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
import { renderMarkdown } from "../services/markdown/renderer";
import { splitNote } from "../services/note";
import { isMonospaceEnabled, isPrettyCaretEnabled, isPrettyCheckboxesEnabled } from "../services/preferences";
import { TouchHint } from "./TouchHint";
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
  canFoldAllSections: () => boolean;
  canUnfoldAllSections: () => boolean;
  cycleFoldSections: () => void;
  foldAllSections: () => void;
  redo: () => void;
  unfoldAllSections: () => void;
  undo: () => void;
};

type EditorProps = {
  initialContent: string;
  initialCursor?: number;
  autoFocus?: boolean;
  onReady?: (api: EditorAPI) => void;
  onChange?: (name: string, content: string) => void;
  onCursorChange?: (cursor: number) => void;
  foldStorageKey?: string;
};

export const Editor = (_props: EditorProps) => {
  const props = mergeProps({ initialCursor: 0 }, _props);
  const [content, setContent] = createSignal(props.initialContent);
  const folding = useEditorFolding({
    content,
    storageKey: props.foldStorageKey,
  });
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

  if (isPrettyCaretEnabled()) {
    usePrettyCaret(
      () => container,
      () => editor,
    );
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
    },
  });

  const syncSelectionPresentation = () => {
    selectionPresentation.sync();
    syncLineReorderHandle();
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
    const visibleSelection = folding.clampSelection(selection);
    lastSelection = visibleSelection;
    return setSelection(editor, visibleSelection.start, { end: visibleSelection.end });
  };

  const toSelection = (selection: number | EditorSelection): EditorSelection =>
    typeof selection === "number"
      ? {
          start: selection,
          end: selection,
        }
      : selection;

  const applyContent = (newContent: string, selection: number | EditorSelection) => {
    const nextSelection = toSelection(selection);

    setContent(newContent);
    applySelection(nextSelection);
    syncSelectionPresentation();
    emitChange();
    requestAnimationFrame(() => {
      scrollCursorIntoView(window.getSelection()!, "smooth");
    });
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
    applyContent(newContent, nextSelection);
  };

  const applyLineReorderEdit = (edit: { content: string; selection: EditorSelection }) => {
    history.record(edit.content, "reorderLine", edit.selection);
    setContent(edit.content);
    suppressNextFocusScroll = true;
    editor.focus({ preventScroll: true });
    window.setTimeout(() => (suppressNextFocusScroll = false), 0);
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
    foldState: folding.foldState,
    getContainer: () => container,
    getCursor: () => lastSelection.start,
    getEditor: () => editor,
  });
  syncLineReorderHandle = lineReorder.syncHandle;

  const applyFoldingChange = (change: () => void) => {
    const selection = getCurrentSelection();

    change();

    requestAnimationFrame(() => {
      if (document.activeElement !== editor) return;

      applySelection(selection);
      syncSelectionPresentation();
    });
  };

  onMount(() => {
    props.onReady?.({
      focus: () => {
        suppressNextFocusScroll = true;
        editor.focus({ preventScroll: true });
        applySelection(lastSelection);
        syncSelectionPresentation();
        window.setTimeout(() => (suppressNextFocusScroll = false), 0);
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
      canFoldAllSections: () => folding.canFoldAll(),
      canUnfoldAllSections: () => folding.canUnfoldAll(),
      cycleFoldSections: () => applyFoldingChange(folding.cycleAll),
      foldAllSections: () => applyFoldingChange(folding.foldAll),
      replaceContent: (name: string, noteContent: string) => {
        const newContent = name + (noteContent ? `\n${noteContent}` : "");
        const { start } = getSelection(editor);
        const newCursor = calculateCursorPosition(content(), newContent, start);

        history.reset();
        setContent(newContent);
        requestAnimationFrame(() => {
          applySelection({
            start: newCursor,
            end: newCursor,
          });
          syncSelectionPresentation();
        });
      },
      redo: () => history.redo(),
      unfoldAllSections: () => applyFoldingChange(folding.unfoldAll),
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
    }
  });

  const onTextInput = (event: InputEvent) => (iosReplacementText = event.data || "");

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "i") {
      event.preventDefault();
      const selection = getCurrentSelection();
      const sectionId = folding.getSectionIdAtPosition(selection.start);

      if (sectionId) cycleFoldSection(sectionId);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "o") {
      event.preventDefault();
      applyFoldingChange(folding.cycleAll);
      return;
    }

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
    const foldedEnterEdit =
      event.inputType === "insertParagraph" ? folding.handleEnterAtFoldedHeading(selection) : null;
    if (foldedEnterEdit) {
      applyEdit(foldedEnterEdit.content, foldedEnterEdit.selection, event.inputType);
      return;
    }

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

  const toggleFoldSection = (sectionId: string) => {
    const selection = getCurrentSelection();
    const wasFocused = document.activeElement === editor;

    folding.toggleSection(sectionId);

    requestAnimationFrame(() => {
      if (!wasFocused) return;

      applySelection(selection);
      syncSelectionPresentation();
    });
  };

  const cycleFoldSection = (sectionId: string) => {
    applyFoldingChange(() => folding.cycleSection(sectionId));
  };

  const handleCopy = (event: ClipboardEvent) => {
    event.preventDefault();
    const { start, end } = getSelection(editor);
    if (start === end) return;

    const selectedText = content().slice(start, end);
    event.clipboardData?.setData("text/plain", selectedText);
  };

  const handleCut = (event: ClipboardEvent) => {
    event.preventDefault();
    const selection = getSelection(editor);
    const { start, end } = selection;
    if (start === end) return;

    const selectedText = content().slice(start, end);
    event.clipboardData?.setData("text/plain", selectedText);

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
          scrollWhenViewportStable(() => scrollCursorIntoView(window.getSelection()!, "smooth"));
        }}
        onBeforeInput={handleBeforeInput}
        onKeyDown={handleKeyDown}
        on:textInput={onTextInput}
        onCopy={handleCopy}
        onCut={handleCut}
      >
        {renderMarkdown(content(), handleCheckboxToggle, {
          foldState: folding.foldState(),
          onFoldToggle: toggleFoldSection,
        })}
      </div>
      {lineReorder.handle() && (
        <button
          type="button"
          class="line-reorder-handle"
          style={{ top: `${lineReorder.handle()!.top}px` }}
          aria-label="Reorder line"
          title="Reorder line"
          onPointerDown={lineReorder.onHandlePointerDown}
        />
      )}
      {lineReorder.indicator() && (
        <div
          class="line-reorder-drop-indicator"
          classList={{ "is-move": lineReorder.indicator()!.isMove }}
          style={{ top: `${lineReorder.indicator()!.top}px` }}
          contentEditable={false}
        />
      )}
      <TouchHint isVisible={isEmpty()} />
    </div>
  );
};
