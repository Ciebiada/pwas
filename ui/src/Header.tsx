import type { JSX } from "solid-js";
import "./Header.css";

export const Header = (props: { children: JSX.Element }) => {
  return <header class="header">{props.children}</header>;
};

export const HeaderButton = (props: {
  onClick?: () => void;
  children: JSX.Element;
  primary?: boolean;
  right?: boolean;
}) => (
  <button
    class="header-button"
    classList={{
      "header-button-primary": props.primary,
      "header-right": props.right,
    }}
    onClick={props.onClick}
  >
    {props.children}
  </button>
);
