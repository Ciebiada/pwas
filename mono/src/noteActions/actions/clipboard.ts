import { getSectionRange } from "../sections";
import type { NoteAction } from "../types";

const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

export const copyNoteAction: NoteAction = {
  id: "copy-note",
  label: "Copy Note",
  isApplicable: () => true,
  run: async (context) => {
    await copyToClipboard(context.content);
    return null;
  },
};

export const copySectionAction: NoteAction = {
  id: "copy-section",
  label: "Copy Section",
  isApplicable: (context) => {
    const range = getSectionRange(context.content, context.selection.start);
    return range !== null;
  },
  run: async (context) => {
    const range = getSectionRange(context.content, context.selection.start);
    if (!range) return null;
    await copyToClipboard(context.content.slice(range.start, range.end));
    return null;
  },
};

export const selectAllAction: NoteAction = {
  id: "select-all",
  label: "Select All",
  isApplicable: () => true,
  run: (context) => ({
    content: context.content,
    selection: { start: 0, end: context.content.length },
  }),
};

export const selectSectionAction: NoteAction = {
  id: "select-section",
  label: "Select Section",
  isApplicable: (context) => {
    const range = getSectionRange(context.content, context.selection.start);
    return range !== null;
  },
  run: (context) => {
    const range = getSectionRange(context.content, context.selection.start);
    if (!range) return null;
    return { content: context.content, selection: range };
  },
};
