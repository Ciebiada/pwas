import { UpdateToast as UiUpdateToast } from "ui/UpdateToast";
import { setUpdateAvailable, triggerUpdate, updateAvailable } from "../pwa";

export const UpdateToast = () => {
  return (
    <UiUpdateToast
      show={updateAvailable()}
      onClick={() => {
        setUpdateAvailable(false);
        triggerUpdate();
      }}
    />
  );
};
