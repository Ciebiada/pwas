import { createSignal, mergeProps, onCleanup, onMount } from "solid-js";
import {
  getSelection,
  setSelection,
  calculateCursorPosition,
  fixCursorPositionForZeroWidthSpace,
  scrollCursorIntoView,
} from "../services/cursor";
import { processBeforeInput } from "../services/editorInput";
import { toggleCheckbox } from "../services/markdown/features/todoList";
import { renderMarkdown } from "../services/markdown/renderer";
import { splitNote } from "../services/note";
import { useCustomCaret } from "../services/customCaret";
import { isIOS } from "../../../ui/src/platform";
import {
  isCustomCaretEnabled,
  isMonospaceEnabled,
} from "../services/preferences";
import "./Editor.css";
import { debounce } from "../services/debounce";
import { handleTab } from "../services/markdown/input";

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
  let ghostInput: HTMLInputElement | undefined;
  let touchStart: { x: number; y: number } | null = null;

  if (isCustomCaretEnabled()) {
    useCustomCaret(
      () => container,
      () => editor,
    );
  }

  const emitChange = () => {
    const { name, content: noteContent } = splitNote(content());
    props.onChange?.(name, noteContent);
  };

  const applyEdit = (newContent: string, cursor: number) => {
    setContent(newContent);
    setSelection(editor, cursor, { scroll: true });
    emitChange();
  };

  onMount(() => {
    props.onReady?.({
      focus: () => {
        editor.focus({ preventScroll: true });
        scrollCursorIntoView(window.getSelection()!, "instant");
      },
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
      editor.focus({ preventScroll: true });
      scrollCursorIntoView(window.getSelection()!, "instant");
    } else {
      editor.blur();
    }

    const onSelectionChange = () => {
      if (document.activeElement !== editor) return;
      if (isIOS) fixCursorPositionForZeroWidthSpace();
      props.onCursorChange?.(getSelection(editor).start);
    };
    const onTextInput = (event: any) => (iosReplacementText = event.data);
    const fixCursorPosition = debounce((e: Event) => {
      if (document.activeElement !== editor) return;
      if (isIOS) {
        const vv = e.target as VisualViewport;
        // Capture only initial resize event
        // document.documentElement.scrollTo(0, 0);
        // if (vv.offsetTop == vv.pageTop) scrollCursorIntoView(window.getSelection()!, "instant");
      }
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
    if (
      event.key === "Tab" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const result = handleTab(content(), getSelection(editor), event.shiftKey);
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

  const handleTouchStart = (e: TouchEvent) => {
    if (isIOS && document.activeElement !== editor) {
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (!touchStart || !ghostInput) return;

    const touchEnd = e.changedTouches[0];
    const distance = Math.hypot(
      touchEnd.clientX - touchStart.x,
      touchEnd.clientY - touchStart.y,
    );

    touchStart = null;

    if (distance < 10) {
      e.preventDefault();

      const range = document.caretRangeFromPoint(
        touchEnd.clientX,
        touchEnd.clientY,
      );

      ghostInput.focus({ preventScroll: true });

      setTimeout(() => {
        editor.focus({ preventScroll: true });
        if (range) {
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
        scrollCursorIntoView(window.getSelection()!, "smooth");
      }, 150);
    }
  };

  return (
    <div
      style={{ position: "relative" }}
      ref={container}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <input
        ref={(e) => (ghostInput = e)}
        style={{
          position: "fixed",
          top: "0",
          left: "0",
          opacity: "0",
          "pointer-events": "none",
          height: "0",
          width: "0",
        }}
      />
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
    </div>
  );
};
