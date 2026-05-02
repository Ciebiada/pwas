type HistorySelection = {
  start: number;
  end: number;
};

type HistoryState = {
  content: string;
  selection: HistorySelection;
};

type HistoryGroup = {
  inputType: string;
  expectedSelection: HistorySelection;
  updatedAt: number;
};

type UseEditorHistoryOptions = {
  getState: () => HistoryState;
  applyState: (state: HistoryState) => void;
};

const HISTORY_LIMIT = 100;
const HISTORY_GROUP_TIMEOUT = 1000;
const GROUPABLE_INPUT_TYPES = new Set(["insertText", "deleteContentBackward"]);

const sameSelection = (a: HistorySelection, b: HistorySelection) => a.start === b.start && a.end === b.end;

export const useEditorHistory = ({ getState, applyState }: UseEditorHistoryOptions) => {
  let undoStack: HistoryState[] = [];
  let redoStack: HistoryState[] = [];
  let historyGroup: HistoryGroup | null = null;

  const pushUndo = (snapshot: HistoryState) => {
    const previous = undoStack.at(-1);
    if (previous && previous.content === snapshot.content && sameSelection(previous.selection, snapshot.selection))
      return;

    undoStack.push(snapshot);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  };

  const record = (newContent: string, inputType: string | undefined, nextSelection: HistorySelection) => {
    const snapshot = getState();
    if (snapshot.content === newContent && sameSelection(snapshot.selection, nextSelection)) return;

    const now = Date.now();
    const isGroupable =
      inputType !== undefined &&
      GROUPABLE_INPUT_TYPES.has(inputType) &&
      snapshot.selection.start === snapshot.selection.end &&
      nextSelection.start === nextSelection.end;
    const canContinueGroup =
      isGroupable &&
      historyGroup?.inputType === inputType &&
      sameSelection(historyGroup.expectedSelection, snapshot.selection) &&
      now - historyGroup.updatedAt <= HISTORY_GROUP_TIMEOUT;

    if (!canContinueGroup) {
      pushUndo(snapshot);
    }

    historyGroup = isGroupable
      ? {
          inputType,
          expectedSelection: nextSelection,
          updatedAt: now,
        }
      : null;
    redoStack = [];
  };

  const reset = () => {
    undoStack = [];
    redoStack = [];
    historyGroup = null;
  };

  const undo = () => {
    const previous = undoStack.pop();
    if (!previous) return;

    redoStack.push(getState());
    if (redoStack.length > HISTORY_LIMIT) redoStack.shift();

    historyGroup = null;
    applyState(previous);
  };

  const redo = () => {
    const next = redoStack.pop();
    if (!next) return;

    pushUndo(getState());

    historyGroup = null;
    applyState(next);
  };

  return {
    canRedo: () => redoStack.length > 0,
    canUndo: () => undoStack.length > 0,
    record,
    reset,
    undo,
    redo,
  };
};
