import { registerSW } from "virtual:pwa-register";
import { createSignal } from "solid-js";

export const [updateAvailable, setUpdateAvailable] = createSignal(false);
let updateSW: (() => Promise<void>) | null = null;

const init = async () => {
  const registration = await navigator.serviceWorker?.ready;

  updateSW = registerSW({
    onNeedRefresh() {
      setUpdateAvailable(true);
    },
  });

  window.addEventListener("focus", () => {
    registration?.update();
  });
};

init();

export const triggerUpdate = () => {
  updateSW?.();
};
