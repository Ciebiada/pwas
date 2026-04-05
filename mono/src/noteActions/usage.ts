import type { NoteAction } from "./types";

const NOTE_ACTION_USAGE_KEY = "note_action_usage";

const getUsageMap = (): Record<string, number> => {
  const stored = localStorage.getItem(NOTE_ACTION_USAGE_KEY);
  if (!stored) return {};

  try {
    const parsed = JSON.parse(stored);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
};

const setUsageMap = (usageMap: Record<string, number>) => {
  localStorage.setItem(NOTE_ACTION_USAGE_KEY, JSON.stringify(usageMap));
};

export const incrementNoteActionUsage = (actionId: string) => {
  const usageMap = getUsageMap();
  usageMap[actionId] = (usageMap[actionId] ?? 0) + 1;
  setUsageMap(usageMap);
};

export const sortNoteActionsByUsage = (actions: NoteAction[]) => {
  const usageMap = getUsageMap();
  const actionOrder = new Map(actions.map((action, index) => [action.id, index]));

  return [...actions].sort((left, right) => {
    const usageDifference = (usageMap[right.id] ?? 0) - (usageMap[left.id] ?? 0);
    if (usageDifference !== 0) return usageDifference;

    return (actionOrder.get(left.id) ?? 0) - (actionOrder.get(right.id) ?? 0);
  });
};
