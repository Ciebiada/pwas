import {
  canIndentListSelection,
  canUnindentListSelection,
  indentListSelection,
} from "../../services/markdown/listIndentation";
import type { NoteAction } from "../types";

export const indentListAction: NoteAction = {
  id: "indent-list",
  label: "Indent",
  isApplicable: ({ content, selection }) => canIndentListSelection(content, selection),
  run: ({ content, selection }) => indentListSelection(content, selection, "indent"),
};

export const unindentListAction: NoteAction = {
  id: "unindent-list",
  label: "Unindent",
  isApplicable: ({ content, selection }) => canUnindentListSelection(content, selection),
  run: ({ content, selection }) => indentListSelection(content, selection, "unindent"),
};
