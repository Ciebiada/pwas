import { Show } from "solid-js";
import "./UpdateToast.css";

type UpdateToastProps = {
  show: boolean;
  onClick: () => void;
};

export const UpdateToast = (props: UpdateToastProps) => {
  return (
    <Show when={props.show}>
      <button class="update-toast" onClick={props.onClick}>
        Update available
      </button>
    </Show>
  );
};
