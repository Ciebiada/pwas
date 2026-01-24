import { ChevronRightIcon, Modal, ModalButton, ModalPage } from "rams";
import type { Accessor, Setter } from "solid-js";
import { useNavigate } from "../hooks/useNavigate";
import "./SettingsModal.css";

type SettingsModalProps = {
  open: Accessor<boolean>;
  setOpen: Setter<boolean>;
};

export const SettingsModal = (props: SettingsModalProps) => {
  const navigate = useNavigate();

  return (
    <Modal
      open={props.open}
      setOpen={props.setOpen}
      height="auto"
      title="Settings"
      onClose={() => props.setOpen(false)}
    >
      <ModalPage id="root">
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
    </Modal>
  );
};
