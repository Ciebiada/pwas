import {
  canTurnBulletSelectionToTodo,
  canTurnTodoSelectionToBullet,
  convertListSelection,
} from "../../services/markdown/listConversion";
import type { NoteAction } from "../types";

export const turnTodoAction: NoteAction = {
  id: "turn-todo",
  label: "Turn Todo",
  isApplicable: ({ content, selection }) => canTurnBulletSelectionToTodo(content, selection),
  run: ({ content, selection }) => convertListSelection(content, selection, "bullet-to-todo"),
};

export const turnBulletAction: NoteAction = {
  id: "turn-bullet",
  label: "Turn Bullet",
  isApplicable: ({ content, selection }) => canTurnTodoSelectionToBullet(content, selection),
  run: ({ content, selection }) => convertListSelection(content, selection, "todo-to-bullet"),
};
