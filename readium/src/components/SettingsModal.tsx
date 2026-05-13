import { type Accessor, createSignal, type Setter, Show } from "solid-js";
import { CheckIcon, ChevronRightIcon } from "ui/Icons";
import { Modal, ModalButton, ModalPage, ModalToggle, useModal } from "ui/Modal";
import { useNavigate } from "../hooks/useNavigate";
import { disconnectGoogleDrive } from "../services/sync/googleDrive";
import { GoogleDriveProvider } from "../services/sync/googleDriveProvider";
import { settings, updateSettings } from "../store/settings";
import { GoogleDriveIcon } from "./Icons";
import "./SettingsModal.css";

type SettingsModalProps = {
  open: Accessor<boolean>;
  setOpen: Setter<boolean>;
};

const SettingsModalContent = () => {
  const navigate = useNavigate();
  const { push } = useModal();
  const [isGoogleDriveConnected, setIsGoogleDriveConnected] = createSignal(GoogleDriveProvider.isAuthenticated());

  const handleGoogleConnect = async () => {
    try {
      window.location.href = await GoogleDriveProvider.getAuthUrl();
    } catch (error) {
      console.error(error);
      alert("Google Drive is not configured.");
    }
  };

  const handleGoogleDisconnect = () => {
    disconnectGoogleDrive();
    setIsGoogleDriveConnected(false);
  };

  const getSyncStatusText = () => {
    if (isGoogleDriveConnected()) return "Google Drive";
    return "None";
  };

  return (
    <>
      <ModalPage id="root">
        <ModalButton onClick={() => push("sync", "Backup & Sync")}>
          <span>Backup & Sync</span>
          <div class="nav-button-content">
            <span class="nav-button-text">{getSyncStatusText()}</span>
            <span class="nav-button-text">
              <ChevronRightIcon />
            </span>
          </div>
        </ModalButton>

        <ModalButton onClick={() => push("preferences", "Preferences")}>
          <span>Preferences</span>
          <span class="nav-button-text">
            <ChevronRightIcon />
          </span>
        </ModalButton>

        <ModalButton
          onClick={async (close) => {
            await close(true);
            navigate("/about");
          }}
        >
          <span>About</span>
          <span class="nav-button-text">
            <ChevronRightIcon />
          </span>
        </ModalButton>
      </ModalPage>

      <ModalPage id="sync">
        <div class="settings-group">
          <ModalButton
            onClick={async () => {
              if (isGoogleDriveConnected()) {
                handleGoogleDisconnect();
              } else {
                await handleGoogleConnect();
              }
            }}
            class="provider-button"
          >
            <div class="provider-content">
              <span class="provider-icon-wrapper">
                <GoogleDriveIcon />
              </span>
              <span>Google Drive</span>
            </div>
            <Show when={isGoogleDriveConnected()}>
              <span class="provider-check">
                <CheckIcon />
              </span>
            </Show>
          </ModalButton>
        </div>
        <p class="settings-description">Connect Google Drive to sync your library and reading position.</p>
      </ModalPage>

      <ModalPage id="preferences">
        <ModalToggle
          label="Reduce Motion"
          checked={() => settings().reduceMotion}
          onChange={(val: boolean) => updateSettings({ reduceMotion: val })}
        />
        <ModalToggle
          label="Page Turn Animations"
          checked={() => settings().pageTurnAnimations}
          onChange={(val: boolean) => updateSettings({ pageTurnAnimations: val })}
        />
      </ModalPage>
    </>
  );
};

export const SettingsModal = (props: SettingsModalProps) => {
  return (
    <Modal
      open={props.open}
      setOpen={props.setOpen}
      height="45dvh"
      title="Settings"
      onClose={() => props.setOpen(false)}
    >
      <SettingsModalContent />
    </Modal>
  );
};
