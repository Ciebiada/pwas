import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import { getScrollParent } from "../services/editorDom";
import { isLineDropMove, type LineRange, type LineReorderEdit, moveLineRange } from "../services/editorLineReorder";
import { triggerHaptic } from "./useHaptic";

const AUTO_SCROLL_BOTTOM_EDGE_PX = 24;
const AUTO_SCROLL_MAX_PX = 18;
const AUTO_SCROLL_TOP_EDGE_PX = 16;

type LineDropIndicator = {
  isMove: boolean;
  top: number;
};

type LineReorderHandle = {
  lineIndex: number;
  top: number;
};

type LineEntry = {
  bottom: number;
  lineIndex: number;
  top: number;
};

type LineSnapshot = {
  containerTop: number;
  entries: LineEntry[];
  scrollParent: HTMLElement | null;
  scrollTop: number;
  visibleBottom: number;
  visibleTop: number;
};

type LineReorderDrag = LineRange &
  LineSnapshot & {
    clientY: number;
    cursor: number;
    dropIndex: number;
    pointerId: number;
  };

type UseEditorLineReorderOptions = {
  applyEdit: (edit: LineReorderEdit) => void;
  content: Accessor<string>;
  getContainer: () => HTMLElement | undefined;
  getCursor: () => number;
  getEditor: () => HTMLElement | undefined;
};

export const useEditorLineReorder = (options: UseEditorLineReorderOptions) => {
  const [handle, setHandle] = createSignal<LineReorderHandle | null>(null);
  const [indicator, setIndicator] = createSignal<LineDropIndicator | null>(null);
  let drag: LineReorderDrag | null = null;
  let autoScrollFrame: number | null = null;
  let syncHandleFrame: number | null = null;

  const getLineElements = () => Array.from(options.getEditor()?.querySelectorAll<HTMLElement>(".md-line") ?? []);

  const canReorderLine = (lineIndex: number) => lineIndex > 0;

  const getLineRange = (lineIndex: number): LineRange => ({ startLineIndex: lineIndex, endLineIndex: lineIndex });

  const getVisibleScrollBounds = (scrollParent: HTMLElement) => {
    const rect = scrollParent.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    const headerBottom = document.querySelector<HTMLElement>(".header")?.offsetHeight ?? 0;
    const top = Math.max(rect.top, viewportTop, headerBottom);

    return {
      bottom: Math.max(top, Math.min(rect.bottom, viewportBottom)),
      top,
    };
  };

  const getLineSnapshot = (): LineSnapshot | null => {
    const container = options.getContainer();
    if (!container) return null;

    const containerTop = container.getBoundingClientRect().top;
    const scrollParent = getScrollParent(options.getEditor() ?? container);
    const scrollBounds = scrollParent ? getVisibleScrollBounds(scrollParent) : { bottom: 0, top: 0 };
    const entries = getLineElements().flatMap((line, lineIndex) => {
      const rect = line.getBoundingClientRect();
      return rect.height > 0
        ? [
            {
              bottom: rect.bottom - containerTop,
              lineIndex,
              top: rect.top - containerTop,
            },
          ]
        : [];
    });

    return {
      containerTop,
      entries,
      scrollParent,
      scrollTop: scrollParent?.scrollTop ?? 0,
      visibleBottom: scrollBounds.bottom,
      visibleTop: scrollBounds.top,
    };
  };

  const getDropTarget = (clientY: number, snapshot: LineSnapshot) => {
    const scrollTop = snapshot.scrollParent?.scrollTop ?? snapshot.scrollTop;
    const containerY = clientY - snapshot.containerTop + scrollTop - snapshot.scrollTop;
    let lastLine: LineEntry | null = null;

    for (const entry of snapshot.entries) {
      if (!canReorderLine(entry.lineIndex)) continue;

      if (containerY < entry.top + (entry.bottom - entry.top) / 2) {
        return { dropIndex: entry.lineIndex, top: entry.top };
      }

      lastLine = entry;
    }

    return lastLine ? { dropIndex: getLineRange(lastLine.lineIndex).endLineIndex + 1, top: lastLine.bottom } : null;
  };

  const syncHandle = () => {
    const container = options.getContainer();
    const editor = options.getEditor();
    if (!container || !editor || drag || document.activeElement !== editor) {
      setHandle(null);
      return;
    }

    const line = editor.querySelector<HTMLElement>(".md-line.is-active-line");
    const lineIndex = line ? getLineElements().indexOf(line) : -1;
    if (!line || !canReorderLine(lineIndex)) {
      setHandle(null);
      return;
    }

    const containerTop = container.getBoundingClientRect().top;
    const rect = line.getBoundingClientRect();
    setHandle(rect.height > 0 ? { lineIndex, top: rect.top - containerTop + rect.height / 2 } : null);
  };

  const queueSyncHandle = () => {
    if (syncHandleFrame !== null) cancelAnimationFrame(syncHandleFrame);
    syncHandleFrame = requestAnimationFrame(() => {
      syncHandleFrame = null;
      syncHandle();
    });
  };

  const removeDragListeners = () => {
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", handlePointerUp);
    document.removeEventListener("pointercancel", handlePointerCancel);
  };

  const stopAutoScroll = () => {
    if (autoScrollFrame !== null) cancelAnimationFrame(autoScrollFrame);
    autoScrollFrame = null;
  };

  const clearDrag = (shouldSyncHandle = true) => {
    drag = null;
    setIndicator(null);
    removeDragListeners();
    stopAutoScroll();
    if (shouldSyncHandle) queueSyncHandle();
  };

  const updateDrop = () => {
    if (!drag) return;

    const target = getDropTarget(drag.clientY, drag);
    if (!target) return;

    drag.dropIndex = target.dropIndex;
    setIndicator({
      isMove: isLineDropMove(drag, target.dropIndex),
      top: target.top,
    });
  };

  const getAutoScrollDelta = () => {
    if (!drag?.scrollParent) return 0;

    const topDistance = drag.clientY - drag.visibleTop;
    const bottomDistance = drag.visibleBottom - drag.clientY;
    const topOverlap = Math.max(0, AUTO_SCROLL_TOP_EDGE_PX - topDistance);
    const bottomOverlap = Math.max(0, AUTO_SCROLL_BOTTOM_EDGE_PX - bottomDistance);
    const overlap = bottomOverlap > 0 ? bottomOverlap : topOverlap;
    if (overlap === 0) return 0;

    const direction = bottomOverlap > 0 ? 1 : -1;
    const edgeSize = bottomOverlap > 0 ? AUTO_SCROLL_BOTTOM_EDGE_PX : AUTO_SCROLL_TOP_EDGE_PX;
    return direction * Math.ceil((Math.min(overlap, edgeSize) / edgeSize) * AUTO_SCROLL_MAX_PX);
  };

  const runAutoScroll = () => {
    autoScrollFrame = null;
    if (!drag?.scrollParent) return;

    const delta = getAutoScrollDelta();
    if (delta === 0) return;

    const previousTop = drag.scrollParent.scrollTop;
    drag.scrollParent.scrollTop += delta;
    updateDrop();

    if (drag.scrollParent.scrollTop !== previousTop) autoScrollFrame = requestAnimationFrame(runAutoScroll);
  };

  const syncAutoScroll = () => {
    if (autoScrollFrame !== null) return;
    if (getAutoScrollDelta() !== 0) autoScrollFrame = requestAnimationFrame(runAutoScroll);
  };

  const onHandlePointerDown = (event: PointerEvent) => {
    const currentHandle = handle();
    const snapshot = getLineSnapshot();
    const target = snapshot ? getDropTarget(event.clientY, snapshot) : null;
    if (!currentHandle || !snapshot || !target) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.pointerType === "touch") triggerHaptic();

    const range = getLineRange(currentHandle.lineIndex);
    drag = {
      ...range,
      ...snapshot,
      clientY: event.clientY,
      cursor: options.getCursor(),
      dropIndex: target.dropIndex,
      pointerId: event.pointerId,
    };

    setHandle(null);
    setIndicator({
      isMove: isLineDropMove(range, target.dropIndex),
      top: target.top,
    });
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerCancel);
  };

  function handlePointerMove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;

    event.preventDefault();
    drag.clientY = event.clientY;
    updateDrop();
    syncAutoScroll();
  }

  function handlePointerUp(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;

    event.preventDefault();
    drag.clientY = event.clientY;
    updateDrop();

    const current = drag;
    clearDrag();

    const edit = moveLineRange(options.content(), current, current.dropIndex, current.cursor);
    if (edit) options.applyEdit(edit);
  }

  function handlePointerCancel(event: PointerEvent) {
    if (drag && event.pointerId === drag.pointerId) clearDrag();
  }

  createEffect(() => {
    options.content();
    queueSyncHandle();
  });

  window.addEventListener("resize", queueSyncHandle);

  onCleanup(() => {
    if (syncHandleFrame !== null) cancelAnimationFrame(syncHandleFrame);
    window.removeEventListener("resize", queueSyncHandle);
    clearDrag(false);
  });

  return {
    handle,
    indicator,
    onHandlePointerDown,
    syncHandle: queueSyncHandle,
  };
};
