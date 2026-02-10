import { mergeProps } from "solid-js";
import "./TouchHint.css";

type TouchHintProps = {
  isVisible?: boolean;
  class?: string;
};

export const TouchHint = (_props: TouchHintProps) => {
  const props = mergeProps({ isVisible: false }, _props);

  return (
    <div class={props.class} classList={{ "touch-hint": true, "is-visible": props.isVisible }} aria-hidden />
  );
};
