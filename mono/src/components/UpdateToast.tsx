import { Show } from "solid-js";
import { setUpdateAvailable, triggerUpdate, updateAvailable } from "../pwa";
import "./UpdateToast.css";

export const UpdateToast = () => {
  return (
    <Show when={updateAvailable()}>
      <button
        class="update-toast"
        onClick={() => {
          setUpdateAvailable(false);
          triggerUpdate();
        }}
      >
        Tap to update
      </button>
    </Show>
  );
};
