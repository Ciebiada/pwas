import { registerSW } from "virtual:pwa-register";
import { createSignal } from "solid-js";

export const [updateAvailable, setUpdateAvailable] = createSignal(false);
let updateSW: (() => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;
let updateIntervalId: number | null = null;

const init = () => {
  if (!("serviceWorker" in navigator)) return;

  const checkForUpdate = () => {
    registration?.update();
  };

  updateSW = registerSW({
    onNeedRefresh() {
      setUpdateAvailable(true);
    },
    onRegisteredSW(_, r) {
      registration = r;
      checkForUpdate();
      if (updateIntervalId === null) {
        updateIntervalId = window.setInterval(() => {
          if (document.visibilityState === "visible") checkForUpdate();
        }, 5 * 1000);
      }
    },
  });

  window.addEventListener("focus", checkForUpdate);
  window.addEventListener("pageshow", checkForUpdate);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
};

init();

export const triggerUpdate = () => {
  updateSW?.();
};

// @ts-expect-error - temporary debug helper
window.showUpdateModal = () => setUpdateAvailable(true);
