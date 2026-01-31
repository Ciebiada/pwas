import { createSignal } from "solid-js";

const PRETTY_CARET_KEY = "custom_caret_enabled";
const PRETTY_CHECKBOXES_KEY = "pretty_checkbox_enabled";
const MONOSPACE_KEY = "monospace_enabled";

export const isPrettyCaretEnabled = (): boolean => {
  const stored = localStorage.getItem(PRETTY_CARET_KEY);
  return stored === null ? true : stored === "true";
};

export const setPrettyCaretEnabled = (enabled: boolean): void => {
  localStorage.setItem(PRETTY_CARET_KEY, enabled.toString());
};

const [prettyCheckboxesMode, setPrettyCheckboxesMode] = createSignal(
  localStorage.getItem(PRETTY_CHECKBOXES_KEY) === null ? true : localStorage.getItem(PRETTY_CHECKBOXES_KEY) === "true",
);

export const isPrettyCheckboxesEnabled = () => prettyCheckboxesMode();

export const setPrettyCheckboxesEnabled = (enabled: boolean) => {
  setPrettyCheckboxesMode(enabled);
  localStorage.setItem(PRETTY_CHECKBOXES_KEY, enabled.toString());
};

const [monospaceMode, setMonospaceMode] = createSignal(localStorage.getItem(MONOSPACE_KEY) === "true");

export const isMonospaceEnabled = () => monospaceMode();

export const setMonospaceEnabled = (enabled: boolean) => {
  setMonospaceMode(enabled);
  localStorage.setItem(MONOSPACE_KEY, enabled.toString());
};
