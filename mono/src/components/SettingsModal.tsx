import { type Accessor, createSignal, type Setter, Show } from "solid-js";
import { CheckIcon, ChevronRightIcon } from "ui/Icons";
import { Modal, ModalButton, ModalPage, ModalToggle, useModal } from "ui/Modal";
import { useNavigate } from "../hooks/useNavigate";
import {
  isCustomCaretEnabled,
  isMonospaceEnabled,
  isPrettyCheckboxEnabled,
  setCustomCaretEnabled,
  setMonospaceEnabled,
  setPrettyCheckboxEnabled,
} from "../services/preferences";
import { disconnectDropbox } from "../services/sync/dropbox";
import { DropboxProvider } from "../services/sync/dropboxProvider";
import { disconnectGoogleDrive, getAuthUrl as getGoogleAuthUrl } from "../services/sync/googleDrive";
import { GoogleDriveProvider } from "../services/sync/googleDriveProvider";
import { DropboxIcon, GoogleDriveIcon } from "./Icons";
import "./SettingsModal.css";

type SettingsModalProps = {
  open: Accessor<boolean>;
  setOpen: Setter<boolean>;
};

const SettingsModalContent = () => {
  const { push } = useModal();
  const navigate = useNavigate();
  const [isDropboxConnected, setIsDropboxConnected] = createSignal(DropboxProvider.isAuthenticated());
  const [isGoogleDriveConnected, setIsGoogleDriveConnected] = createSignal(GoogleDriveProvider.isAuthenticated());
  const [customCaretEnabled, setCustomCaretEnabledSignal] = createSignal(isCustomCaretEnabled());
  const [prettyCheckboxEnabled, setPrettyCheckboxEnabledSignal] = createSignal(isPrettyCheckboxEnabled());
  const [monospaceEnabled, setMonospaceEnabledSignal] = createSignal(isMonospaceEnabled());

  const handleCustomCaretChange = (enabled: boolean) => {
    setCustomCaretEnabled(enabled);
    setCustomCaretEnabledSignal(enabled);
  };

  const handlePrettyCheckboxChange = (enabled: boolean) => {
    setPrettyCheckboxEnabled(enabled);
    setPrettyCheckboxEnabledSignal(enabled);
  };

  const handleMonospaceChange = (enabled: boolean) => {
    setMonospaceEnabled(enabled);
    setMonospaceEnabledSignal(enabled);
  };

  const handleDropboxConnect = async () => {
    if (isGoogleDriveConnected()) {
      disconnectGoogleDrive();
      setIsGoogleDriveConnected(false);
    }
    window.location.href = await DropboxProvider.getAuthUrl();
  };

  const handleDropboxDisconnect = () => {
    disconnectDropbox();
    setIsDropboxConnected(false);
  };

  const handleGoogleConnect = async () => {
    if (isDropboxConnected()) {
      disconnectDropbox();
      setIsDropboxConnected(false);
    }
    window.location.href = await getGoogleAuthUrl();
  };

  const handleGoogleDisconnect = () => {
    disconnectGoogleDrive();
    setIsGoogleDriveConnected(false);
  };

  const getSyncStatusText = () => {
    if (isDropboxConnected()) return "Dropbox";
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
                handleGoogleConnect();
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
          <ModalButton
            onClick={async () => {
              if (isDropboxConnected()) {
                handleDropboxDisconnect();
              } else {
                handleDropboxConnect();
              }
            }}
            class="provider-button"
          >
            <div class="provider-content">
              <span class="provider-icon-wrapper">
                <DropboxIcon />
              </span>
              <span>Dropbox</span>
            </div>
            <Show when={isDropboxConnected()}>
              <span class="provider-check">
                <CheckIcon />
              </span>
            </Show>
          </ModalButton>
        </div>
        <p class="settings-description">Select a provider to sync your notes.</p>
      </ModalPage>

      <ModalPage id="preferences">
        <ModalToggle label="Pretty Caret" checked={customCaretEnabled} onChange={handleCustomCaretChange} />
        <ModalToggle label="Pretty Checkbox" checked={prettyCheckboxEnabled} onChange={handlePrettyCheckboxChange} />
        <ModalToggle label="Monospace Font" checked={monospaceEnabled} onChange={handleMonospaceChange} />
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
