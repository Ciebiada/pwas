import { type Accessor, createMemo, createSignal } from "solid-js";
import {
  type FoldSection,
  type FoldSectionStates,
  type FoldSectionVisibility,
  getMarkdownFoldState,
} from "../services/markdown/folding";

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

const isFoldSectionVisibility = (value: unknown): value is FoldSectionVisibility =>
  value === "folded" || value === "children";

const toFoldSectionVisibility = (value: unknown): FoldSectionVisibility | null => {
  if (isFoldSectionVisibility(value)) return value;
  if (value === "headings") return "children";
  return null;
};

const readSectionStates = (storageKey: string | undefined): Map<string, FoldSectionVisibility> => {
  if (!storageKey) return new Map();

  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return new Map();

    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return new Map(
        parsed
          .filter((value): value is string => typeof value === "string")
          .map((sectionId) => [sectionId, "folded" as const]),
      );
    }

    if (!parsed || typeof parsed !== "object") return new Map();

    return new Map(
      Object.entries(parsed).flatMap(([sectionId, value]) => {
        const visibility = toFoldSectionVisibility(value);
        return visibility ? [[sectionId, visibility]] : [];
      }),
    );
  } catch {
    return new Map();
  }
};

const writeSectionStates = (storageKey: string | undefined, sectionStates: FoldSectionStates) => {
  if (!storageKey) return;

  try {
    if (sectionStates.size === 0) {
      localStorage.removeItem(storageKey);
      return;
    }

    const entries = [...sectionStates.entries()];
    const storedValue = entries.every(([, visibility]) => visibility === "folded")
      ? entries.map(([sectionId]) => sectionId)
      : Object.fromEntries(entries);

    localStorage.setItem(storageKey, JSON.stringify(storedValue));
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

const getLineIndexAtOffset = (lineStarts: number[], offset: number) => {
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

const getDescendantSectionIds = (section: FoldSection, sections: FoldSection[]) =>
  sections
    .filter((candidate) => candidate.lineIndex > section.lineIndex && candidate.endLineIndex <= section.endLineIndex)
    .map((candidate) => candidate.id);

const getChildSections = (section: FoldSection, sections: FoldSection[]) =>
  sections.filter(
    (candidate) =>
      candidate.lineIndex > section.lineIndex &&
      candidate.endLineIndex <= section.endLineIndex &&
      candidate.level === section.level + 1,
  );

const getRootSections = (sections: FoldSection[]) =>
  sections.filter(
    (section) =>
      !sections.some(
        (candidate) => section.lineIndex > candidate.lineIndex && section.endLineIndex <= candidate.endLineIndex,
      ),
  );

const showChildSections = (next: Map<string, FoldSectionVisibility>, section: FoldSection, sections: FoldSection[]) => {
  next.set(section.id, "children");
  for (const childSection of getChildSections(section, sections)) {
    next.set(childSection.id, "folded");
  }
};

const getGlobalChildrenStates = (sections: FoldSection[]) => {
  const next = new Map<string, FoldSectionVisibility>();

  for (const section of getRootSections(sections)) {
    const childSections = getChildSections(section, sections);
    if (childSections.length === 0) continue;

    next.set(section.id, "children");
    for (const childSection of childSections) {
      next.set(childSection.id, "folded");
    }
  }

  return next;
};

export const useEditorFolding = (options: UseEditorFoldingOptions) => {
  const [sectionStates, setSectionStates] = createSignal<FoldSectionStates>(readSectionStates(options.storageKey));
  const foldState = createMemo(() => getMarkdownFoldState(options.content(), sectionStates()));

  const writeFoldedState = (next: Map<string, FoldSectionVisibility>) => {
    writeSectionStates(options.storageKey, next);
    return next;
  };

  const toggleSection = (sectionId: string) => {
    const currentFoldState = foldState();
    const section = currentFoldState.sectionsById.get(sectionId);
    if (!section) return;

    setSectionStates((current) => {
      const next = new Map(current);

      if (section.visibility === "children") {
        next.delete(sectionId);
        for (const descendantSectionId of getDescendantSectionIds(section, currentFoldState.sections)) {
          next.delete(descendantSectionId);
        }
      } else if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.set(sectionId, "folded");
      }

      return writeFoldedState(next);
    });
  };

  const hasChildSections = (section: FoldSection) => section.firstChildLineIndex !== undefined;

  const cycleSection = (sectionId: string) => {
    const currentFoldState = foldState();
    const section = currentFoldState.sectionsById.get(sectionId);
    if (!section) return;

    setSectionStates((current) => {
      const next = new Map(current);

      if (section.visibility === "folded") {
        next.delete(sectionId);
        if (hasChildSections(section)) {
          showChildSections(next, section, currentFoldState.sections);
        }
      } else if (section.visibility === "children") {
        next.delete(sectionId);
        for (const descendantSectionId of getDescendantSectionIds(section, currentFoldState.sections)) {
          next.delete(descendantSectionId);
        }
      } else {
        next.set(sectionId, "folded");
      }

      return writeFoldedState(next);
    });
  };

  const foldAll = () => {
    setSectionStates(() =>
      writeFoldedState(new Map(foldState().sections.map((section) => [section.id, "folded" as const]))),
    );
  };

  const unfoldAll = () => {
    setSectionStates(() => writeFoldedState(new Map()));
  };

  const getGlobalCycleVisibility = (): FoldSectionVisibility | undefined => {
    const sections = foldState().sections;
    if (sections.length > 0 && sections.every((section) => section.visibility === "folded")) return "folded";
    const childrenStates = getGlobalChildrenStates(sections);
    if (childrenStates.size > 0 && sections.every((section) => section.visibility === childrenStates.get(section.id))) {
      return "children";
    }

    return undefined;
  };

  const cycleAll = () => {
    const visibility = getGlobalCycleVisibility();
    if (visibility === "folded") {
      setSectionStates(() => {
        const next = getGlobalChildrenStates(foldState().sections);
        return writeFoldedState(next);
      });
      return;
    }

    if (visibility === "children") {
      unfoldAll();
      return;
    }

    foldAll();
  };

  const canFoldAll = () => foldState().sections.some((section) => section.visibility !== "folded");

  const canUnfoldAll = () => foldState().sections.some((section) => section.visibility !== undefined);

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
    getSectionIdAtLineIndex(getLineIndexAtOffset(getLineStartOffsets(options.content()), position));

  const clampPosition = (position: number) => {
    const currentContent = options.content();
    const lineStarts = getLineStartOffsets(currentContent);
    const lineIndex = getLineIndexAtOffset(lineStarts, position);
    if (foldState().lines[lineIndex]?.isHidden) {
      let containingVisibleSection: FoldSection | undefined;

      for (const section of foldState().sections) {
        if (
          lineIndex > section.lineIndex &&
          lineIndex <= section.endLineIndex &&
          !foldState().lines[section.lineIndex]?.isHidden
        ) {
          containingVisibleSection = section;
        }
      }

      if (containingVisibleSection) {
        return getLineEndOffset(currentContent, lineStarts, containingVisibleSection.lineIndex);
      }
    }

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
    const lineIndex = getLineIndexAtOffset(lineStarts, selection.start);
    const lineEnd = getLineEndOffset(currentContent, lineStarts, lineIndex);
    if (selection.start !== lineEnd) return null;

    const sectionId = foldState().lines[lineIndex]?.sectionId;
    const section = sectionId ? foldState().sectionsById.get(sectionId) : undefined;
    if (!section?.isFolded) return null;

    const insertAt = getLineEndOffset(currentContent, lineStarts, section.endLineIndex);

    setSectionStates((current) => {
      const next = new Map(current);
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
    cycleAll,
    cycleSection,
    foldAll,
    foldState,
    getSectionIdAtPosition,
    handleEnterAtFoldedHeading,
    toggleSection,
    unfoldAll,
  };
};
