import { Show } from "solid-js";
import "./UpdateToast.css";

type UpdateToastProps = {
  show: boolean;
  onClick: () => void;
  label?: string;
};

export const UpdateToast = (props: UpdateToastProps) => {
  return (
    <Show when={props.show}>
      <button class="update-toast" onClick={props.onClick}>
        {props.label ?? "Tap to update"}
      </button>
    </Show>
  );
};
