import { Show } from "solid-js";
import { setUpdateAvailable, triggerUpdate, updateAvailable } from "../pwa";
import "./UpdateToast.css";

export const UpdateToast = () => {
  return (
    <Show when={updateAvailable()}>
      <div class="update-toast">
        <span>Update available</span>
        <div class="update-toast-buttons">
          <button
            class="update-toast-button"
            onClick={() => {
              setUpdateAvailable(false);
              triggerUpdate();
            }}
          >
            Reload
          </button>
          <button class="update-toast-button update-toast-dismiss" onClick={() => setUpdateAvailable(false)}>
            ✕
          </button>
        </div>
      </div>
    </Show>
  );
};
