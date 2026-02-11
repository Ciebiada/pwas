import { registerSW } from "virtual:pwa-register";
import { createSignal } from "solid-js";

export const [updateAvailable, setUpdateAvailable] = createSignal(false);
let updateSW: (() => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;
let updateIntervalId: number | null = null;

const init = () => {
  if (!("serviceWorker" in navigator)) return;

  const checkForUpdate = async () => {
    const currentRegistration = registration || (await navigator.serviceWorker.getRegistration());
    if (!currentRegistration) return;
    registration = currentRegistration;
    await currentRegistration.update();
  };

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      setUpdateAvailable(true);
    },
    onRegisteredSW(_, r) {
      registration = r;
      void checkForUpdate();
      if (updateIntervalId === null) {
        updateIntervalId = window.setInterval(() => {
          if (document.visibilityState === "visible") void checkForUpdate();
        }, 60 * 1000);
      }
    },
  });

  window.addEventListener("focus", () => void checkForUpdate());
  window.addEventListener("pageshow", () => void checkForUpdate());
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkForUpdate();
  });
};

init();

export const triggerUpdate = () => {
  updateSW?.();
};

// @ts-expect-error - temporary debug helper
window.showUpdateModal = () => setUpdateAvailable(true);
