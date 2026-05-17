import type { JSX } from "solid-js";
import "./Header.css";
import { isScrolled } from "./scrollState";
import { useActivatable } from "./useActivatable";

export const Header = (props: { children: JSX.Element; title?: string; titleIcon?: JSX.Element }) => {
  return (
    <header class="header">
      {props.title && (
        <h2 class="header-title" classList={{ "header-title-fade": isScrolled() }}>
          {props.titleIcon && (
            <span class="header-title-icon" aria-hidden="true">
              {props.titleIcon}
            </span>
          )}
          <span class="header-title-text">{props.title}</span>
        </h2>
      )}
      {props.children}
    </header>
  );
};

export const HeaderButton = (props: {
  onClick?: () => void;
  onMouseDown?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  onTouchStart?: JSX.EventHandlerUnion<HTMLButtonElement, TouchEvent>;
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
      onMouseDown={props.onMouseDown}
      onTouchStart={props.onTouchStart}
    >
      {props.children}
    </button>
  );
};
