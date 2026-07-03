import { type Accessor, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { normalizeNoteName } from "../services/note";

type EditorSelection = {
  start: number;
  end: number;
};

type WikiCompletionTrigger = {
  start: number;
  end: number;
  replaceEnd: number;
  query: string;
};

export type WikiCompletionOption = {
  title: string;
  create?: boolean;
};

export type WikiCompletionPosition = {
  left: number;
  top: number;
  maxHeight: number;
};

type UseWikiLinkCompletionOptions = {
  applyEdit: (content: string, selection: number | EditorSelection, inputType?: string) => void;
  content: Accessor<string>;
  getEditor: () => HTMLDivElement | undefined;
  getSuggestions?: (query: string) => string[] | Promise<string[]>;
};

export const INSERT_WIKI_LINK_INPUT_TYPE = "insertWikiLink";

const getWikiReplacementEnd = (editorContent: string, cursor: number) => {
  const remaining = editorContent.slice(cursor);
  const closingOffset = remaining.indexOf("]]");
  const lineBreakOffset = remaining.indexOf("\n");
  if (closingOffset < 0) return cursor;
  if (lineBreakOffset >= 0 && lineBreakOffset < closingOffset) return cursor;

  return cursor + closingOffset + 2;
};

const getWikiTrigger = (editorContent: string, selection: EditorSelection) => {
  if (selection.start !== selection.end) return null;

  const titleLineEnd = editorContent.indexOf("\n");
  if (titleLineEnd < 0 || selection.start <= titleLineEnd) return null;

  const beforeCursor = editorContent.slice(0, selection.start);
  const start = beforeCursor.lastIndexOf("[[");
  if (start < 0 || start <= titleLineEnd) return null;

  const query = editorContent.slice(start + 2, selection.start);
  if (query.includes("\n") || query.includes("]")) return null;

  return {
    start,
    end: selection.start,
    replaceEnd: getWikiReplacementEnd(editorContent, selection.start),
    query,
  };
};

export const useWikiLinkCompletion = (options: UseWikiLinkCompletionOptions) => {
  const [trigger, setTrigger] = createSignal<WikiCompletionTrigger | null>(null);
  const [suggestions, setSuggestions] = createSignal<string[]>([]);
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [position, setPosition] = createSignal<WikiCompletionPosition | null>(null);
  let menu: HTMLDivElement | undefined;
  let request = 0;

  const close = () => {
    setTrigger(null);
    setSuggestions([]);
    setSelectedIndex(0);
    setPosition(null);
  };

  const getCaretRect = () => {
    const editor = options.getEditor();
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;

    const range = selection.getRangeAt(0).cloneRange();
    if (!editor.contains(range.commonAncestorContainer)) return null;

    const rect = range.getClientRects()[0] || range.getBoundingClientRect();
    if (rect && (rect.width > 0 || rect.height > 0)) return rect;

    const anchor =
      range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
    if (anchor instanceof HTMLElement) return anchor.getBoundingClientRect();

    return null;
  };

  const syncPosition = () => {
    if (!trigger() || !menu) return;

    const caret = getCaretRect();
    if (!caret) return;

    const menuRect = menu.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const spaceBelow = viewportHeight - caret.bottom - gap - margin;
    const spaceAbove = caret.top - margin;
    const vertical = spaceBelow >= menuRect.height || spaceBelow >= spaceAbove ? "down" : "up";
    const spaceRight = viewportWidth - caret.left - margin;
    const spaceLeft = caret.right - margin;
    const horizontal = spaceRight >= menuRect.width || spaceRight >= spaceLeft ? "right" : "left";
    const left = horizontal === "right" ? caret.left : caret.right - menuRect.width;

    const maxHeight = Math.min(Math.max(vertical === "down" ? spaceBelow : spaceAbove, 60), 240);
    const effectiveMenuHeight = Math.min(menuRect.height, maxHeight);

    setPosition({
      left: Math.max(margin, Math.min(left, viewportWidth - menuRect.width - margin)),
      top: vertical === "down" ? caret.bottom + gap : caret.top - effectiveMenuHeight - gap,
      maxHeight,
    });
  };

  const schedulePositionSync = () => {
    requestAnimationFrame(syncPosition);
  };

  const completionOptions = createMemo<WikiCompletionOption[]>(() => {
    const query = trigger()?.query.trim() ?? "";
    const nextOptions = suggestions().map((title) => ({ title }));
    if (!query || nextOptions.some((option) => normalizeNoteName(option.title) === normalizeNoteName(query)))
      return nextOptions;

    return [...nextOptions, { title: query, create: true }];
  });

  const refresh = async (selection: EditorSelection) => {
    const nextTrigger = getWikiTrigger(options.content(), selection);
    const requestId = ++request;
    if (!nextTrigger || !options.getSuggestions) {
      close();
      return;
    }

    const nextSuggestions = await options.getSuggestions(nextTrigger.query);
    if (requestId !== request) return;

    const isOpening = trigger() === null;
    setTrigger(nextTrigger);
    setSuggestions(nextSuggestions);
    setSelectedIndex(0);
    if (isOpening) setPosition(null);
    schedulePositionSync();
  };

  const accept = (option: WikiCompletionOption) => {
    const currentTrigger = trigger();
    if (!currentTrigger) return;

    const replacement = `[[${option.title}]]`;
    const nextContent = `${options.content().slice(0, currentTrigger.start)}${replacement}${options.content().slice(currentTrigger.replaceEnd)}`;
    close();
    options.applyEdit(nextContent, currentTrigger.start + replacement.length, INSERT_WIKI_LINK_INPUT_TYPE);
  };

  const selectNextOption = (direction: 1 | -1) => {
    const nextOptions = completionOptions();
    if (!nextOptions.length) return;

    setSelectedIndex((index) => (index + direction + nextOptions.length) % nextOptions.length);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!trigger() || completionOptions().length === 0) return false;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectNextOption(1);
      return true;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      selectNextOption(-1);
      return true;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      accept(completionOptions()[selectedIndex()]);
      return true;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return true;
    }

    return false;
  };

  const setMenuRef = (element: HTMLDivElement) => {
    menu = element;
    if (!position()) schedulePositionSync();
  };

  onMount(() => {
    window.addEventListener("resize", syncPosition);
    window.visualViewport?.addEventListener("resize", syncPosition);
    window.visualViewport?.addEventListener("scroll", syncPosition);

    onCleanup(() => {
      window.removeEventListener("resize", syncPosition);
      window.visualViewport?.removeEventListener("resize", syncPosition);
      window.visualViewport?.removeEventListener("scroll", syncPosition);
    });
  });

  return {
    accept,
    close,
    handleKeyDown,
    isOpen: createMemo(() => trigger() !== null && completionOptions().length > 0),
    options: completionOptions,
    position,
    refresh,
    selectedIndex,
    setMenuRef,
  };
};
