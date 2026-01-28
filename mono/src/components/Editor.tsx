import { createSignal, mergeProps, onCleanup, onMount } from "solid-js";
import { isIOS } from "ui/platform";
import { useAnimatedCheckbox } from "../hooks/useAnimatedCheckbox";
import { useCustomCaret } from "../hooks/useCustomCaret";
import {
  calculateCursorPosition,
  fixCursorPositionForZeroWidthSpace,
  getSelection,
  scrollCursorIntoView,
  setSelection,
} from "../services/cursor";
import { processBeforeInput } from "../services/editorInput";
import { toggleCheckbox } from "../services/markdown/features/todoList";
import { handleTab } from "../services/markdown/input";
import { renderMarkdown } from "../services/markdown/renderer";
import { splitNote } from "../services/note";
import { isCustomCaretEnabled, isMonospaceEnabled } from "../services/preferences";
import "./Editor.css";

export type EditorAPI = {
  focus: () => void;
  replaceContent: (name: string, content: string) => void;
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

  let editor: HTMLDivElement;
  let container: HTMLDivElement | undefined;
  let iosReplacementText = "";

  if (isCustomCaretEnabled()) {
    useCustomCaret(
      () => container,
      () => editor,
    );
  }

  useAnimatedCheckbox(() => editor);

  const emitChange = () => {
    const { name, content: noteContent } = splitNote(content());
    props.onChange?.(name, noteContent);
  };

  const applyEdit = (newContent: string, cursor: number) => {
    setContent(newContent);
    setSelection(editor, cursor);
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
      replaceContent: (name: string, noteContent: string) => {
        const newContent = name + (noteContent ? `\n${noteContent}` : "");
        const { start } = getSelection(editor);
        const newCursor = calculateCursorPosition(content(), newContent, start);

        setContent(newContent);
        requestAnimationFrame(() => {
          setSelection(editor, newCursor);
        });
      },
    });

    const selection = setSelection(editor, props.initialCursor);
    if (selection) scrollCursorIntoView(selection, "instant");

    if (props.autoFocus && !isIOS) {
      editor.focus();
    } else {
      // This is to blur the forced focus after the initialCursor position has been set
      editor.blur();
    }

    const onSelectionChange = () => {
      if (document.activeElement !== editor) return;
      if (isIOS) fixCursorPositionForZeroWidthSpace();
      props.onCursorChange?.(getSelection(editor).start);
    };

    document.addEventListener("selectionchange", onSelectionChange);

    onCleanup(() => {
      document.removeEventListener("selectionchange", onSelectionChange);
    });
  });

  const onTextInput = (event: InputEvent) => (iosReplacementText = event.data || "");

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const result = handleTab(content(), getSelection(editor), event.shiftKey);
      applyEdit(result.content, result.cursor);
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
    applyEdit(newContent, start);
  };

  return (
    <div class="editor-container" ref={container}>
      <div
        ref={(e) => (editor = e)}
        classList={{ editor: true, monospace: isMonospaceEnabled() }}
        contentEditable={true}
        spellcheck={false}
        onFocus={() => {
          editor.focus({ preventScroll: true });
          setTimeout(() => {
            scrollCursorIntoView(window.getSelection()!, "smooth");
          }, 200);
        }}
        onBeforeInput={handleBeforeInput}
        onKeyDown={handleKeyDown}
        on:textInput={onTextInput}
      >
        {renderMarkdown(content(), handleCheckboxToggle)}
      </div>
    </div>
  );
};
