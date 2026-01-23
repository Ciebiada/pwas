import { onCleanup } from "solid-js";
import { isScrolling } from "./scrollState";

const ACTIVATION_DELAY = 30;
const SCROLL_THRESHOLD = 5;
const TAP_ACTIVE_STATE_DURATION = 150;

export type ActivatableOptions = {
  fastRelease?: boolean;
};

export const useActivatable = (options?: ActivatableOptions) => {
  let element: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  let activationTimer: ReturnType<typeof setTimeout> | null = null;
  let deactivationTimer: ReturnType<typeof setTimeout> | null = null;
  let isScrollHandled = false;

  const deactivationDuration = options?.fastRelease ? 10 : TAP_ACTIVE_STATE_DURATION;

  const clearTimers = () => {
    if (activationTimer) {
      clearTimeout(activationTimer);
      activationTimer = null;
    }
    if (deactivationTimer) {
      clearTimeout(deactivationTimer);
      deactivationTimer = null;
    }
  };

  const deactivate = () => {
    clearTimers();
    if (element) {
      element.classList.remove("activated");
    }
  };

  const handleTouchStart = (e: TouchEvent) => {
    if (isScrolling()) return;

    const touch = e.touches[0];
    if (!touch) return;

    startX = touch.clientX;
    startY = touch.clientY;
    isScrollHandled = false;

    clearTimers();
    if (element) {
      element.classList.remove("activated");
    }

    activationTimer = setTimeout(() => {
      if (element && !isScrollHandled) {
        element.classList.add("activated");
      }
      activationTimer = null;
    }, ACTIVATION_DELAY);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (isScrollHandled) return;

    const touch = e.touches[0];
    if (!touch) return;

    const deltaX = Math.abs(touch.clientX - startX);
    const deltaY = Math.abs(touch.clientY - startY);

    if (deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD) {
      isScrollHandled = true;
      deactivate();
    }
  };

  const handleTouchEnd = () => {
    if (isScrollHandled) {
      deactivate();
      return;
    }

    if (element) {
      element.classList.add("activated");
    }

    clearTimers();

    deactivationTimer = setTimeout(() => {
      if (element) {
        element.classList.remove("activated");
      }
      deactivationTimer = null;
    }, deactivationDuration);
  };

  const handleClick = (e: MouseEvent) => {
    if (isScrollHandled) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  };

  const ref = (el: HTMLElement) => {
    element = el;
    el.addEventListener("touchstart", handleTouchStart);
    el.addEventListener("touchmove", handleTouchMove);
    el.addEventListener("touchend", handleTouchEnd);
    el.addEventListener("touchcancel", deactivate);
    el.addEventListener("click", handleClick, true);

    onCleanup(() => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", deactivate);
      el.removeEventListener("click", handleClick, true);
      deactivate();
    });
  };

  return ref;
};
