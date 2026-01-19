import { isIOS } from "./platform";

const HAPTIC_DURATION = 5;

let input: HTMLInputElement | null = null;
let label: HTMLLabelElement | null = null;

const ensureHapticElements = () => {
  if (input) return;

  input = document.createElement("input");
  input.type = "checkbox";
  input.id = "haptic-switch";
  input.setAttribute("switch", "");
  input.style.display = "none";
  document.body.appendChild(input);

  label = document.createElement("label");
  label.htmlFor = "haptic-switch";
  label.style.display = "none";
  document.body.appendChild(label);
};

export const triggerHaptic = (duration = HAPTIC_DURATION) => {
  if (!isIOS && navigator?.vibrate) {
    navigator.vibrate(duration);
    return;
  }

  ensureHapticElements();
  label?.click();
};
