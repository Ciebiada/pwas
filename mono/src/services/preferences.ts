import { createSignal } from "solid-js";

const CUSTOM_CARET_KEY = "custom_caret_enabled";
const MONOSPACE_KEY = "monospace_enabled";

export const isCustomCaretEnabled = (): boolean => {
  const stored = localStorage.getItem(CUSTOM_CARET_KEY);
  return stored === null ? true : stored === "true";
};

export const setCustomCaretEnabled = (enabled: boolean): void => {
  localStorage.setItem(CUSTOM_CARET_KEY, enabled.toString());
};

const [monospaceMode, setMonospaceMode] = createSignal(localStorage.getItem(MONOSPACE_KEY) === "true");

export const isMonospaceEnabled = () => monospaceMode();

export const setMonospaceEnabled = (enabled: boolean) => {
  setMonospaceMode(enabled);
  localStorage.setItem(MONOSPACE_KEY, enabled.toString());
};
