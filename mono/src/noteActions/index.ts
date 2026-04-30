import { headingLevel2Action, subheadingAction, titleHeadingAction } from "./actions/headings";
import { boldAction, italicAction, strikethroughAction } from "./actions/inlineFormatting";
import { removeCheckedTasksAction } from "./actions/removeCheckedTasks";
import { getNoteActionLabel, type NoteActionContext, type ResolvedNoteAction } from "./types";
import { sortNoteActionsByUsage } from "./usage";

const noteActions = [
  boldAction,
  italicAction,
  strikethroughAction,
  titleHeadingAction,
  headingLevel2Action,
  subheadingAction,
  removeCheckedTasksAction,
];

export const getApplicableNoteActions = (context: NoteActionContext): ResolvedNoteAction[] =>
  sortNoteActionsByUsage(noteActions.filter((action) => action.isApplicable(context))).map((action) => ({
    action,
    context,
    label: getNoteActionLabel(action, context),
  }));
