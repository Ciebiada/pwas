import { db, type Note } from "./db";
import { normalizeNoteName } from "./note";

const NUMBERED_NAME_PATTERN = /^(.*\S)\s+(\d+)$/;

export const getDisplayNoteName = (name: string) => name.trim();

const getComparableNoteName = (note: Pick<Note, "name">) => normalizeNoteName(note.name);

const getNumberedBase = (name: string) => {
  const match = name.match(NUMBERED_NAME_PATTERN);
  if (!match) return { base: name.trim() };

  return {
    base: match[1].trim(),
  };
};

export const allocateUniqueNoteNameFromNotes = (
  requestedName: string,
  notes: Array<Pick<Note, "id" | "name" | "status">>,
  currentNoteId?: number,
) => {
  const displayName = getDisplayNoteName(requestedName);
  const normalizedName = normalizeNoteName(displayName);
  if (!normalizedName) return "";

  const existingNames = new Set(
    notes
      .filter((note) => note.id !== currentNoteId)
      .filter((note) => note.status !== "pending-delete")
      .map(getComparableNoteName)
      .filter(Boolean),
  );

  if (!existingNames.has(normalizedName)) return displayName;

  const { base } = getNumberedBase(displayName);
  let nextNumber = 2;
  let nextName = `${base} ${nextNumber}`;
  while (existingNames.has(normalizeNoteName(nextName))) {
    nextNumber += 1;
    nextName = `${base} ${nextNumber}`;
  }

  return nextName;
};

export const allocateUniqueNoteName = async (requestedName: string, currentNoteId?: number) =>
  allocateUniqueNoteNameFromNotes(requestedName, await db.notes.toArray(), currentNoteId);

export const findNoteByNameFromNotes = <T extends Pick<Note, "id" | "name" | "status">>(name: string, notes: T[]) => {
  const displayName = getDisplayNoteName(name);
  if (!displayName) return undefined;

  const normalizedName = normalizeNoteName(displayName);
  return notes.find((note) => note.status !== "pending-delete" && getComparableNoteName(note) === normalizedName);
};

export const getWikiLinkSuggestionsFromNotes = <T extends Pick<Note, "id" | "name" | "status">>(
  query: string,
  notes: T[],
  currentNoteId?: number,
  limit = 8,
) => {
  const normalizedQuery = normalizeNoteName(query);
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);

  const rankMatch = (note: T) => {
    const comparableName = getComparableNoteName(note);
    if (!normalizedQuery) return { index: 0, length: comparableName.length };

    return {
      index: comparableName.indexOf(normalizedQuery),
      length: comparableName.length,
    };
  };

  return notes
    .filter((note) => note.id !== currentNoteId)
    .filter((note) => note.status !== "pending-delete")
    .filter((note) => note.name.trim())
    .filter((note) => !normalizedQuery || getComparableNoteName(note).includes(normalizedQuery))
    .sort((a, b) => {
      if (!normalizedQuery) return byName(a, b);

      const aRank = rankMatch(a);
      const bRank = rankMatch(b);
      if (aRank.index !== bRank.index) return aRank.index - bRank.index;
      if (aRank.length !== bRank.length) return aRank.length - bRank.length;
      return byName(a, b);
    })
    .slice(0, limit);
};
