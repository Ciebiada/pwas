import { onCleanup } from "solid-js";

type IOSKeyboardFocusOptions = {
  getTargetInput: () => HTMLInputElement | undefined;
  shouldFocus?: () => boolean;
  onFocus?: () => void;
};

export const useIOSKeyboardFocus = (options: IOSKeyboardFocusOptions) => {
  let focusProxyRef: HTMLInputElement | undefined;
  let focusTimer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    if (focusTimer !== undefined) {
      clearTimeout(focusTimer);
      focusTimer = undefined;
    }
  };

  const focusInput = () => {
    options.onFocus?.();
    options.getTargetInput()?.focus({ preventScroll: true });
  };

  const focusInputSoon = () => {
    clearTimer();
    requestAnimationFrame(() => {
      if (options.shouldFocus?.() === false) return;
      focusTimer = setTimeout(() => {
        focusTimer = undefined;
        if (options.shouldFocus?.() === false) return;
        focusInput();
      }, 0);
    });
  };

  const focusProxy = () => focusProxyRef?.focus({ preventScroll: true });

  const proxyRef = (el: HTMLInputElement) => {
    focusProxyRef = el;
  };

  const isProxyFocused = () => document.activeElement === focusProxyRef;
  const isEitherFocused = () => document.activeElement === options.getTargetInput() || isProxyFocused();

  onCleanup(clearTimer);

  return { proxyRef, focusInput, focusInputSoon, focusProxy, clearTimer, isEitherFocused };
};
