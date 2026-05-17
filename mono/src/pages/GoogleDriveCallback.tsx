import { onMount } from "solid-js";
import "./GoogleDriveCallback.css";
import { handleGoogleAuthCallback } from "../services/sync/googleDrive";

export const GoogleDriveCallback = () => {
  onMount(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (code) {
      const success = await handleGoogleAuthCallback(code);
      if (success) {
        window.location.replace("/");
        return;
      }
    }

    console.error("Google Drive authentication failed");
    window.location.replace("/");
  });

  return (
    <main class="auth-callback-page" aria-live="polite" aria-busy="true">
      <p>Authenticating with Google Drive...</p>
    </main>
  );
};
