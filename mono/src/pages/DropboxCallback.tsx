import { onMount } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { handleAuthCallback } from "../services/sync/dropbox";
import { useNavigate } from "../hooks/useNavigate";

export const DropboxCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  onMount(async () => {
    const code = Array.isArray(searchParams.code)
      ? searchParams.code[0]
      : searchParams.code;

    if (code) {
      try {
        const success = await handleAuthCallback(code);
        if (success) {
          // TODO: should sync here?
          console.log("Dropbox connected successfully");
        } else {
          console.error("Failed to handle OAuth callback");
        }
      } catch (error) {
        console.error("Error during OAuth callback:", error);
      }
    }

    navigate("/");
  });

  return null;
};
