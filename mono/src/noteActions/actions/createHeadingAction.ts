import { getHeadingLevelAtSelection, type HeadingLevel, setHeadingLevelAtSelection } from "../headings";
import type { NoteAction } from "../types";

type HeadingActionConfig = {
  id: string;
  label: string;
  icon: string;
  level: HeadingLevel;
};

export const createHeadingAction = ({ id, label, icon, level }: HeadingActionConfig): NoteAction => ({
  id,
  label,
  icon,
  isApplicable: (context) => getHeadingLevelAtSelection(context) !== level,
  run: (context) => setHeadingLevelAtSelection(context, level),
});
