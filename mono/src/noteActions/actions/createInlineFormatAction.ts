import { insertPairAtCursor } from "../helpers";
import { applyInlineFormatAction, type InlineFormat, selectionHasInlineFormat } from "../inlineFormatting";
import type { NoteAction } from "../types";

type InlineFormatActionConfig = {
  id: string;
  label: string;
  icon: string;
  format: InlineFormat;
};

export const createInlineFormatAction = ({ id, label, icon, format }: InlineFormatActionConfig): NoteAction => ({
  id,
  label: (context) =>
    context.selection.start < context.selection.end && selectionHasInlineFormat(context, format.type)
      ? "Regular"
      : label,
  icon,
  isApplicable: () => true,
  run: (context) =>
    context.selection.start === context.selection.end
      ? insertPairAtCursor(context, format.delimiter)
      : applyInlineFormatAction(context, format),
});
