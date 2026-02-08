import { registerSW } from "virtual:pwa-register";
import { createSignal } from "solid-js";

export const [updateAvailable, setUpdateAvailable] = createSignal(false);
let updateSW: (() => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;

const init = () => {
  if (!("serviceWorker" in navigator)) return;

  updateSW = registerSW({
    onNeedRefresh() {
      setUpdateAvailable(true);
    },
    onRegisteredSW(_, r) {
      registration = r;
    },
  });

  const checkForUpdate = () => {
    registration?.update();
  };

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
