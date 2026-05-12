import { onMount } from "solid-js";
import { useNavigate } from "../hooks/useNavigate";
import { sync } from "../services/sync";
import { handleGoogleAuthCallback } from "../services/sync/googleDrive";

export const GoogleDriveCallback = () => {
  const navigate = useNavigate();

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code && (await handleGoogleAuthCallback(code))) {
      await sync();
      navigate("/");
      return;
    }

    console.error("Google Drive authentication failed");
    navigate("/");
  });

  return <div>Authenticating with Google Drive...</div>;
};
