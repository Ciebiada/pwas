import type { JSX } from "solid-js";
import "./Header.css";
import { isScrolled } from "./scrollState";
import { useActivatable } from "./useActivatable";

export const Header = (props: { children: JSX.Element; title?: string }) => {
  return (
    <header class="header">
      {props.title && (
        <h2 class="header-title" classList={{ "header-title-fade": isScrolled() }}>
          {props.title}
        </h2>
      )}
      {props.children}
    </header>
  );
};

export const HeaderButton = (props: {
  onClick?: () => void;
  children: JSX.Element;
  primary?: boolean;
  right?: boolean;
}) => {
  const activatableRef = useActivatable({ fastRelease: true });

  return (
    <button
      ref={activatableRef}
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
};
