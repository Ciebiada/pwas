import type { Selection } from "../services/markdown/utils";

export type NoteActionLabel = string | ((context: NoteActionContext) => string);

export type NoteActionContext = {
  noteId: number;
  content: string;
  selection: Selection;
};

export type NoteActionResult = {
  content: string;
  selection?: Selection;
};

export type NoteAction = {
  id: string;
  label: NoteActionLabel;
  icon?: string;
  isApplicable: (context: NoteActionContext) => boolean;
  run: (context: NoteActionContext) => NoteActionResult | null | Promise<NoteActionResult | null>;
};

export type ResolvedNoteAction = {
  action: NoteAction;
  context: NoteActionContext;
  label: string;
};

export const getNoteActionLabel = (action: NoteAction, context: NoteActionContext) =>
  typeof action.label === "function" ? action.label(context) : action.label;
