import {
  canTurnBulletSelectionToTodo,
  canTurnSelectionToBullet,
  canTurnSelectionToRegular,
  canTurnSelectionToTodo,
  canTurnTodoSelectionToBullet,
  convertListSelection,
} from "../../services/markdown/listConversion";
import type { NoteAction } from "../types";

export const turnTodoAction: NoteAction = {
  id: "turn-todo",
  label: "Turn Todo",
  isApplicable: ({ content, selection }) => canTurnSelectionToTodo(content, selection),
  run: ({ content, selection }) => {
    if (canTurnBulletSelectionToTodo(content, selection))
      return convertListSelection(content, selection, "bullet-to-todo");
    return convertListSelection(content, selection, "regular-to-todo");
  },
};

export const turnBulletAction: NoteAction = {
  id: "turn-bullet",
  label: "Turn Bullet",
  isApplicable: ({ content, selection }) => canTurnSelectionToBullet(content, selection),
  run: ({ content, selection }) => {
    if (canTurnTodoSelectionToBullet(content, selection))
      return convertListSelection(content, selection, "todo-to-bullet");
    return convertListSelection(content, selection, "regular-to-bullet");
  },
};

export const turnRegularAction: NoteAction = {
  id: "turn-regular",
  label: "Turn Regular Text",
  isApplicable: ({ content, selection }) => canTurnSelectionToRegular(content, selection),
  run: ({ content, selection }) => convertListSelection(content, selection, "list-to-regular"),
};
