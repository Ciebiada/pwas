export type FoldHeadingLevel = 1 | 2 | 3;

export type FoldSectionVisibility = "folded" | "children";

export type FoldSectionStates = ReadonlyMap<string, FoldSectionVisibility>;

export type FoldSection = {
  id: string;
  lineIndex: number;
  level: FoldHeadingLevel;
  endLineIndex: number;
  firstChildLineIndex?: number;
  visibility?: FoldSectionVisibility;
  isFolded: boolean;
  isShowingChildren: boolean;
};

export type FoldLineState = {
  sectionId?: string;
  level?: FoldHeadingLevel;
  isFoldableHeading?: boolean;
  isFolded?: boolean;
  isShowingChildren?: boolean;
  isHidden?: boolean;
};

export type MarkdownFoldState = {
  lines: FoldLineState[];
  sections: FoldSection[];
  sectionsById: Map<string, FoldSection>;
};

const CODE_FENCE = "```";

const normalizeHeadingText = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "heading";

const getHeading = (line: string, lineIndex: number): { level: FoldHeadingLevel; text: string } | null => {
  if (lineIndex === 0) return null;

  const match = line.match(/^(#{1,3}) (.*)$/);
  if (!match) return null;

  return {
    level: match[1].length as FoldHeadingLevel,
    text: match[2],
  };
};

const findClosingCodeFence = (lines: string[], startIndex: number) => {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (lines[index].trim() === CODE_FENCE) return index;
  }
  return -1;
};

const getHeadingByLine = (lines: string[]) => {
  const headings = new Map<number, { level: FoldHeadingLevel; text: string }>();
  let activeCodeBlockClosingIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (activeCodeBlockClosingIndex !== -1) {
      if (index === activeCodeBlockClosingIndex) activeCodeBlockClosingIndex = -1;
      continue;
    }

    if (index > 0 && line.startsWith(CODE_FENCE)) {
      const closingFenceIndex = findClosingCodeFence(lines, index);
      if (closingFenceIndex !== -1) {
        activeCodeBlockClosingIndex = closingFenceIndex;
        continue;
      }
    }

    const heading = getHeading(line, index);
    if (heading) headings.set(index, heading);
  }

  return headings;
};

export const getMarkdownFoldState = (markdown: string, sectionStates: FoldSectionStates): MarkdownFoldState => {
  const lines = markdown.split("\n");
  const headingByLine = getHeadingByLine(lines);
  const lineStates: FoldLineState[] = Array.from({ length: lines.length }, () => ({}));
  const sections: FoldSection[] = [];
  const sectionsById = new Map<string, FoldSection>();
  const headingStack: string[] = [];
  const siblingCounts = new Map<string, number>();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const heading = headingByLine.get(lineIndex);
    if (!heading) continue;

    headingStack.length = heading.level - 1;

    const normalizedText = normalizeHeadingText(heading.text);
    const parentId = headingStack.join("/");
    const countKey = `${parentId}|${heading.level}|${normalizedText}`;
    const siblingCount = (siblingCounts.get(countKey) ?? 0) + 1;
    siblingCounts.set(countKey, siblingCount);

    const segment = `h${heading.level}:${normalizedText}:${siblingCount}`;
    const id = parentId ? `${parentId}/${segment}` : segment;
    headingStack[heading.level - 1] = segment;

    let endLineIndex = lines.length - 1;
    let firstChildLineIndex: number | undefined;
    for (let nextLineIndex = lineIndex + 1; nextLineIndex < lines.length; nextLineIndex += 1) {
      const nextHeading = headingByLine.get(nextLineIndex);
      if (nextHeading?.level === heading.level + 1 && firstChildLineIndex === undefined) {
        firstChildLineIndex = nextLineIndex;
      }

      if (nextHeading && nextHeading.level <= heading.level) {
        endLineIndex = nextLineIndex - 1;
        break;
      }
    }

    if (endLineIndex <= lineIndex) continue;

    const visibility = sectionStates.get(id);
    const section = {
      id,
      lineIndex,
      level: heading.level,
      endLineIndex,
      firstChildLineIndex,
      visibility,
      isFolded: visibility === "folded",
      isShowingChildren: visibility === "children",
    };

    sections.push(section);
    sectionsById.set(id, section);
    lineStates[lineIndex] = {
      sectionId: id,
      level: heading.level,
      isFoldableHeading: true,
      isFolded: section.isFolded,
      isShowingChildren: section.isShowingChildren,
    };
  }

  const activeFoldedSections: FoldSection[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    while (
      activeFoldedSections.length > 0 &&
      lineIndex > activeFoldedSections[activeFoldedSections.length - 1].endLineIndex
    ) {
      activeFoldedSections.pop();
    }

    const heading = headingByLine.get(lineIndex);

    if (heading) {
      while (
        activeFoldedSections.length > 0 &&
        heading.level <= activeFoldedSections[activeFoldedSections.length - 1].level
      ) {
        activeFoldedSections.pop();
      }
    }

    if (activeFoldedSections.length > 0) {
      lineStates[lineIndex] = {
        ...lineStates[lineIndex],
        isHidden: true,
      };
    }

    const sectionId = lineStates[lineIndex].sectionId;
    const section = sectionId ? sectionsById.get(sectionId) : undefined;
    if (section?.isFolded) activeFoldedSections.push(section);
  }

  return {
    lines: lineStates,
    sections,
    sectionsById,
  };
};
