import { createSignal } from "solid-js";

const CUSTOM_CARET_KEY = "custom_caret_enabled";
const PRETTY_CHECKBOX_KEY = "pretty_checkbox_enabled";
const MONOSPACE_KEY = "monospace_enabled";

export const isCustomCaretEnabled = (): boolean => {
  const stored = localStorage.getItem(CUSTOM_CARET_KEY);
  return stored === null ? true : stored === "true";
};

export const setCustomCaretEnabled = (enabled: boolean): void => {
  localStorage.setItem(CUSTOM_CARET_KEY, enabled.toString());
};

const [prettyCheckboxMode, setPrettyCheckboxMode] = createSignal(
  localStorage.getItem(PRETTY_CHECKBOX_KEY) === null ? true : localStorage.getItem(PRETTY_CHECKBOX_KEY) === "true",
);

export const isPrettyCheckboxEnabled = () => prettyCheckboxMode();

export const setPrettyCheckboxEnabled = (enabled: boolean) => {
  setPrettyCheckboxMode(enabled);
  localStorage.setItem(PRETTY_CHECKBOX_KEY, enabled.toString());
};

const [monospaceMode, setMonospaceMode] = createSignal(localStorage.getItem(MONOSPACE_KEY) === "true");

export const isMonospaceEnabled = () => monospaceMode();

export const setMonospaceEnabled = (enabled: boolean) => {
  setMonospaceMode(enabled);
  localStorage.setItem(MONOSPACE_KEY, enabled.toString());
};
