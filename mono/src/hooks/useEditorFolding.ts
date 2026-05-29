import { type Accessor, createMemo, createSignal } from "solid-js";
import { getMarkdownFoldState } from "../services/markdown/folding";

type Selection = {
  start: number;
  end: number;
};

type Edit = {
  content: string;
  selection: Selection;
};

type UseEditorFoldingOptions = {
  content: Accessor<string>;
  storageKey?: string;
};

const readFoldedSectionIds = (storageKey: string | undefined): Set<string> => {
  if (!storageKey) return new Set();

  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return new Set();

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return new Set();

    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set();
  }
};

const writeFoldedSectionIds = (storageKey: string | undefined, foldedSectionIds: ReadonlySet<string>) => {
  if (!storageKey) return;

  try {
    if (foldedSectionIds.size === 0) {
      localStorage.removeItem(storageKey);
      return;
    }

    localStorage.setItem(storageKey, JSON.stringify([...foldedSectionIds]));
  } catch {
    return;
  }
};

const getLineStartOffsets = (content: string) => {
  const offsets = [0];

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") offsets.push(index + 1);
  }

  return offsets;
};

const getLineIndexAtOffset = (content: string, offset: number) => {
  const lineStarts = getLineStartOffsets(content);
  let lineIndex = 0;

  for (let index = 1; index < lineStarts.length; index += 1) {
    if (lineStarts[index] > offset) break;
    lineIndex = index;
  }

  return lineIndex;
};

const getLineEndOffset = (content: string, lineStarts: number[], lineIndex: number) => {
  const nextLineStart = lineStarts[lineIndex + 1];
  return nextLineStart === undefined ? content.length : nextLineStart - 1;
};

export const useEditorFolding = (options: UseEditorFoldingOptions) => {
  const [foldedSectionIds, setFoldedSectionIds] = createSignal<ReadonlySet<string>>(
    readFoldedSectionIds(options.storageKey),
  );
  const foldState = createMemo(() => getMarkdownFoldState(options.content(), foldedSectionIds()));

  const writeFoldedState = (next: Set<string>) => {
    writeFoldedSectionIds(options.storageKey, next);
    return next;
  };

  const toggleSection = (sectionId: string) => {
    setFoldedSectionIds((current) => {
      const next = new Set(current);

      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }

      return writeFoldedState(next);
    });
  };

  const foldAll = () => {
    setFoldedSectionIds(() => writeFoldedState(new Set(foldState().sections.map((section) => section.id))));
  };

  const unfoldAll = () => {
    setFoldedSectionIds(() => writeFoldedState(new Set()));
  };

  const canFoldAll = () => foldState().sections.some((section) => !section.isFolded);

  const canUnfoldAll = () => foldState().sections.some((section) => section.isFolded);

  const getSectionIdAtLineIndex = (lineIndex: number) => {
    const lineSectionId = foldState().lines[lineIndex]?.sectionId;
    if (lineSectionId) return lineSectionId;

    let containingSectionId: string | undefined;
    for (const section of foldState().sections) {
      if (lineIndex > section.lineIndex && lineIndex <= section.endLineIndex) {
        containingSectionId = section.id;
      }
    }

    return containingSectionId;
  };

  const getSectionIdAtPosition = (position: number) =>
    getSectionIdAtLineIndex(getLineIndexAtOffset(options.content(), position));

  const clampPosition = (position: number) => {
    const currentContent = options.content();
    const lineStarts = getLineStartOffsets(currentContent);

    for (const section of foldState().sections) {
      if (!section.isFolded) continue;

      const hiddenStart = lineStarts[section.lineIndex + 1];
      if (hiddenStart === undefined) continue;

      const hiddenEnd = getLineEndOffset(currentContent, lineStarts, section.endLineIndex);
      if (position >= hiddenStart && position <= hiddenEnd) {
        return getLineEndOffset(currentContent, lineStarts, section.lineIndex);
      }
    }

    return position;
  };

  const clampSelection = (selection: Selection): Selection => ({
    start: clampPosition(selection.start),
    end: clampPosition(selection.end),
  });

  const handleEnterAtFoldedHeading = (selection: Selection): Edit | null => {
    if (selection.start !== selection.end) return null;

    const currentContent = options.content();
    const lineStarts = getLineStartOffsets(currentContent);
    const lineIndex = getLineIndexAtOffset(currentContent, selection.start);
    const lineEnd = getLineEndOffset(currentContent, lineStarts, lineIndex);
    if (selection.start !== lineEnd) return null;

    const sectionId = foldState().lines[lineIndex]?.sectionId;
    const section = sectionId ? foldState().sectionsById.get(sectionId) : undefined;
    if (!section?.isFolded) return null;

    const insertAt = getLineEndOffset(currentContent, lineStarts, section.endLineIndex);

    setFoldedSectionIds((current) => {
      const next = new Set(current);
      next.delete(section.id);
      return writeFoldedState(next);
    });

    return {
      content: `${currentContent.slice(0, insertAt)}\n${currentContent.slice(insertAt)}`,
      selection: {
        start: insertAt + 1,
        end: insertAt + 1,
      },
    };
  };

  return {
    canFoldAll,
    canUnfoldAll,
    clampSelection,
    foldAll,
    foldState,
    getSectionIdAtPosition,
    handleEnterAtFoldedHeading,
    toggleSection,
    unfoldAll,
  };
};
