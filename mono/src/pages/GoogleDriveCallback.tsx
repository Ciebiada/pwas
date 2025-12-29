import { useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";
import { handleGoogleAuthCallback } from "../services/sync/googleDrive";

export const GoogleDriveCallback = () => {
  const navigate = useNavigate();

  onMount(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (code) {
      const success = await handleGoogleAuthCallback(code);
      if (success) {
        navigate("/", { replace: true });
        return;
      }
    }

    console.error("Google Drive authentication failed");
    navigate("/", { replace: true });
  });

  return <div>Authenticating with Google Drive...</div>;
};
