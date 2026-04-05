import { createMemo, createSignal, mergeProps, onMount } from "solid-js";
import { isIOS } from "ui/platform";
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
};

export type EditorAPI = {
  focus: () => void;
  replaceContent: (name: string, content: string) => void;
  getState: () => EditorState;
  applyEdit: (edit: EditorEdit) => void;
};

type EditorProps = {
  initialContent: string;
  initialCursor?: number;
  autoFocus?: boolean;
  onReady?: (api: EditorAPI) => void;
  onChange?: (name: string, content: string) => void;
  onCursorChange?: (cursor: number) => void;
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
  let lastSelection: EditorSelection = {
    start: props.initialCursor,
    end: props.initialCursor,
  };

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
    },
  });

  const emitChange = () => {
    const { name, content: noteContent } = splitNote(content());
    props.onChange?.(name, noteContent);
  };

  const applySelection = (selection: EditorSelection) => {
    lastSelection = selection;
    return setSelection(editor, selection.start, { end: selection.end });
  };

  const applyEdit = (newContent: string, selection: number | EditorSelection) => {
    const nextSelection =
      typeof selection === "number"
        ? {
            start: selection,
            end: selection,
          }
        : selection;

    setContent(newContent);
    applySelection(nextSelection);
    selectionPresentation.sync();
    emitChange();
    requestAnimationFrame(() => {
      scrollCursorIntoView(window.getSelection()!, "smooth");
    });
  };

  onMount(() => {
    props.onReady?.({
      focus: () => {
        editor.focus();
      },
      getState: () => ({
        content: content(),
        selection: lastSelection,
      }),
      applyEdit: (edit) => {
        applyEdit(edit.content, edit.selection ?? lastSelection);
      },
      replaceContent: (name: string, noteContent: string) => {
        const newContent = name + (noteContent ? `\n${noteContent}` : "");
        const { start } = getSelection(editor);
        const newCursor = calculateCursorPosition(content(), newContent, start);

        setContent(newContent);
        requestAnimationFrame(() => {
          applySelection({
            start: newCursor,
            end: newCursor,
          });
          selectionPresentation.sync();
        });
      },
    });

    const selection = applySelection({
      start: props.initialCursor,
      end: props.initialCursor,
    });
    if (selection) scrollCursorIntoView(selection, "instant");

    if (props.autoFocus && !isIOS) {
      editor.focus();
      selectionPresentation.sync();
    } else {
      // This is to blur the forced focus after the initialCursor position has been set
      editor.blur();
    }
  });

  const onTextInput = (event: InputEvent) => (iosReplacementText = event.data || "");

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const result = handleTab(content(), getSelection(editor), event.shiftKey);
      applyEdit(result.content, result.cursor);
      return;
    }

    if (selectionPresentation.handleKeyDown(event)) {
      event.preventDefault();
      return;
    }
  };

  const handleBeforeInput = (event: InputEvent) => {
    event.preventDefault();

    const result = processBeforeInput(event.inputType, content(), getSelection(editor), {
      eventData: event.inputType === "insertFromPaste" ? event.dataTransfer?.getData("text/plain") : event.data,
      iosReplacementText,
    });

    if (result) {
      applyEdit(result.content, result.cursor);
    }
  };

  const handleCheckboxToggle = (lineIndex: number) => {
    const { start } = getSelection(editor);
    const newContent = toggleCheckbox(content(), lineIndex);
    setContent(newContent);
    if (document.activeElement === editor) {
      applySelection({
        start,
        end: start,
      });
    }
    emitChange();
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
      applyEdit(result.content, result.cursor);
    }
  };

  return (
    <div class="editor-container" ref={container}>
      <div
        ref={(e) => (editor = e)}
        classList={{
          editor: true,
          monospace: isMonospaceEnabled(),
          "pretty-checkboxes": isPrettyCheckboxesEnabled(),
        }}
        contentEditable={true}
        spellcheck={false}
        onFocus={() => {
          editor.focus({ preventScroll: true });
          selectionPresentation.sync();
          scrollWhenViewportStable(() => scrollCursorIntoView(window.getSelection()!, "smooth"));
        }}
        onBeforeInput={handleBeforeInput}
        onKeyDown={handleKeyDown}
        on:textInput={onTextInput}
        onCopy={handleCopy}
        onCut={handleCut}
      >
        {renderMarkdown(content(), handleCheckboxToggle)}
      </div>
      <TouchHint isVisible={isEmpty()} />
    </div>
  );
};
