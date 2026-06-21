import { onCleanup } from "solid-js";
import { isScrolling } from "./scrollState";

const ACTIVATION_DELAY = 30;
const SCROLL_THRESHOLD = 5;
const TAP_ACTIVE_STATE_DURATION = 150;
const HOLD_DELAY = 450;

export type ActivatableOptions = {
  fastRelease?: boolean;
  holdDelay?: number;
  onHold?: () => void;
  onTap?: (e: MouseEvent) => void;
};

export const useActivatable = (options?: ActivatableOptions) => {
  let element: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  let activationTimer: ReturnType<typeof setTimeout> | null = null;
  let deactivationTimer: ReturnType<typeof setTimeout> | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let isScrollHandled = false;
  let holdTriggered = false;
  let touchInProgress = false;

  const deactivationDuration = options?.fastRelease ? 10 : TAP_ACTIVE_STATE_DURATION;
  const holdDelay = options?.holdDelay ?? HOLD_DELAY;

  const clearTimers = () => {
    if (activationTimer) {
      clearTimeout(activationTimer);
      activationTimer = null;
    }
    if (deactivationTimer) {
      clearTimeout(deactivationTimer);
      deactivationTimer = null;
    }
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  const deactivate = () => {
    clearTimers();
    if (element) {
      element.classList.remove("activated");
    }
  };

  const scheduleDeactivation = () => {
    clearTimers();
    deactivationTimer = setTimeout(() => {
      if (element) {
        element.classList.remove("activated");
      }
      deactivationTimer = null;
    }, deactivationDuration);
  };

  const startHoldTimer = () => {
    if (!options?.onHold) return;

    holdTimer = setTimeout(() => {
      if (!isScrollHandled) {
        holdTriggered = true;
        options.onHold?.();
      }
      holdTimer = null;
    }, holdDelay);
  };

  const handleTouchStart = (e: TouchEvent) => {
    if (isScrolling()) return;

    const touch = e.touches[0];
    if (!touch) return;

    touchInProgress = true;
    startX = touch.clientX;
    startY = touch.clientY;
    isScrollHandled = false;
    holdTriggered = false;

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
    startHoldTimer();
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (holdTriggered) {
      e.preventDefault();
      return;
    }

    if (isScrollHandled) return;

    const touch = e.touches[0];
    if (!touch) return;

    const deltaX = Math.abs(touch.clientX - startX);
    const deltaY = Math.abs(touch.clientY - startY);

    if (deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD) {
      isScrollHandled = true;
      clearTimers();
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

    scheduleDeactivation();
  };

  const handleClick = (e: MouseEvent) => {
    touchInProgress = false;
    if (isScrollHandled || holdTriggered) {
      holdTriggered = false;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return;
    }

    options?.onTap?.(e);
    scheduleDeactivation();
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;

    // On touch devices, iOS fires a synthetic mousedown after touchend.
    // Don't reset gesture state — isScrollHandled from the touch sequence
    // must survive so handleClick can cancel the tap after a slide-out.
    if (touchInProgress) {
      touchInProgress = false;
      return;
    }

    startX = e.clientX;
    startY = e.clientY;
    isScrollHandled = false;
    holdTriggered = false;

    clearTimers();
    startHoldTimer();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!holdTimer) return;

    const deltaX = Math.abs(e.clientX - startX);
    const deltaY = Math.abs(e.clientY - startY);

    if (deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD) {
      isScrollHandled = true;
      clearTimers();
    }
  };

  const ref = (el: HTMLElement) => {
    element = el;
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    el.addEventListener("touchcancel", deactivate);
    el.addEventListener("mousedown", handleMouseDown);
    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("mouseup", clearTimers);
    el.addEventListener("mouseleave", clearTimers);
    el.addEventListener("click", handleClick, true);

    onCleanup(() => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", deactivate);
      el.removeEventListener("mousedown", handleMouseDown);
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("mouseup", clearTimers);
      el.removeEventListener("mouseleave", clearTimers);
      el.removeEventListener("click", handleClick, true);
      deactivate();
    });
  };

  return ref;
};
