import { hasCheckedTasksInCurrentList, removeCheckedTasksFromCurrentList } from "../taskLists";
import type { NoteAction } from "../types";

export const removeCheckedTasksAction: NoteAction = {
  id: "remove-checked-tasks",
  label: "Remove Checked Tasks",
  isApplicable: hasCheckedTasksInCurrentList,
  run: removeCheckedTasksFromCurrentList,
};
