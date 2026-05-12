import { onMount } from "solid-js";
import "./GoogleDriveCallback.css";
import { handleGoogleAuthCallback } from "../services/sync/googleDrive";

export const GoogleDriveCallback = () => {
  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code && (await handleGoogleAuthCallback(code))) {
      window.location.replace("/");
      return;
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
