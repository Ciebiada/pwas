import { copyNoteAction, copySectionAction, selectAllAction, selectSectionAction } from "./actions/clipboard";
import { headingLevel2Action, subheadingAction, titleHeadingAction } from "./actions/headings";
import { boldAction, italicAction, strikethroughAction } from "./actions/inlineFormatting";
import { turnBulletAction, turnRegularAction, turnTodoAction } from "./actions/listConversion";
import { indentListAction, unindentListAction } from "./actions/listIndentation";
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
  turnTodoAction,
  turnBulletAction,
  turnRegularAction,
  indentListAction,
  unindentListAction,
  removeCheckedTasksAction,
  copyNoteAction,
  copySectionAction,
  selectAllAction,
  selectSectionAction,
];

export const getNoteActions = (context: NoteActionContext): ResolvedNoteAction[] =>
  sortNoteActionsByUsage(noteActions)
    .map((action) => ({
      action,
      context,
      label: getNoteActionLabel(action, context),
      isAvailable: action.isApplicable(context),
    }))
    .sort((a, b) => {
      if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
      return 0;
    });
