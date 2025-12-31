import { createSignal, mergeProps, onCleanup, onMount } from "solid-js";
import {
  getSelection,
  setSelection,
  calculateCursorPosition,
  fixCursorPositionForZeroWidthSpace,
  scrollCursorIntoView,
} from "../services/cursor";
import { processBeforeInput, processTab } from "../services/editorInput";
import { toggleCheckbox } from "../services/markdownInput";
import { renderMarkdown } from "../services/markdown";
import { splitNote } from "../services/note";
import { useCustomCaret } from "../services/customCaret";
import { isIOS } from "../services/platform";
import {
  isCustomCaretEnabled,
  isMonospaceEnabled,
} from "../services/preferences";
import "./Editor.css";
import { debounce } from "../services/debounce";

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
  let iosReplacementText = "";

  if (isCustomCaretEnabled()) {
    useCustomCaret(() => editor);
  }

  const emitChange = () => {
    const { name, content: noteContent } = splitNote(content());
    props.onChange?.(name, noteContent);
  };

  const applyEdit = (newContent: string, cursor: number) => {
    setContent(newContent);
    setSelection(editor, cursor);
    emitChange();
  };

  onMount(() => {
    props.onReady?.({
      focus: () => editor.focus(),
      replaceContent: (name: string, noteContent: string) => {
        const newContent = name + (noteContent ? "\n" + noteContent : "");
        const { start } = getSelection(editor);
        const newCursor = calculateCursorPosition(content(), newContent, start);

        setContent(newContent);
        requestAnimationFrame(() => {
          setSelection(editor, newCursor);
        });
      },
    });

    setSelection(editor, props.initialCursor, { scroll: true });

    if (props.autoFocus && !isIOS) {
      editor.focus();
    } else {
      editor.blur();
    }

    const onSelectionChange = () => {
      if (document.activeElement !== editor) return;
      if (isIOS) fixCursorPositionForZeroWidthSpace();
      props.onCursorChange?.(getSelection(editor).start);
    };
    const onTextInput = (event: any) => (iosReplacementText = event.data);
    const fixCursorPosition = debounce(() => {
      if (document.activeElement !== editor) return;
      if (isIOS) scrollCursorIntoView(window.getSelection()!, "instant");
    }, 100);

    document.addEventListener("selectionchange", onSelectionChange);
    editor.addEventListener("textInput", onTextInput);
    if (window.visualViewport)
      window.visualViewport.addEventListener("resize", fixCursorPosition);

    onCleanup(() => {
      document.removeEventListener("selectionchange", onSelectionChange);
      editor.removeEventListener("textInput", onTextInput);
      if (window.visualViewport)
        window.visualViewport.removeEventListener("resize", fixCursorPosition);
    });
  });

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const result = processTab(
        content(),
        getSelection(editor),
        event.shiftKey,
      );
      applyEdit(result.content, result.cursor);
    }
  };

  const handleBeforeInput = (event: InputEvent) => {
    event.preventDefault();

    const result = processBeforeInput(
      event.inputType,
      content(),
      getSelection(editor),
      {
        eventData:
          event.inputType === "insertFromPaste"
            ? event.dataTransfer?.getData("text/plain")
            : event.data,
        iosReplacementText,
      },
    );

    if (result) {
      applyEdit(result.content, result.cursor);
    }
  };

  const handleCheckboxToggle = (lineIndex: number) => {
    const newContent = toggleCheckbox(content(), lineIndex);
    setContent(newContent);
    emitChange();
  };

  return (
    <div
      ref={(e) => (editor = e)}
      classList={{ editor: true, monospace: isMonospaceEnabled() }}
      contentEditable={true}
      spellcheck={false}
      onBeforeInput={handleBeforeInput}
      onKeyDown={handleKeyDown}
    >
      {renderMarkdown(content(), handleCheckboxToggle)}
    </div>
  );
};
