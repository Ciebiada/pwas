import type { JSX } from "solid-js";
import { useActivatable } from "./useActivatable";
import "./ActionList.css";

type ActionListProps = {
  children: JSX.Element;
};

type ActionListItemProps = {
  title: string;
  subtitle?: string;
  icon?: JSX.Element;
  tone?: "default" | "blue" | "orange" | "pink" | "danger";
  danger?: boolean;
  class?: string;
  onClick?: () => void | Promise<void>;
  onPressStart?: () => void;
};

export const ActionList = (props: ActionListProps) => <div class="action-list">{props.children}</div>;

export const ActionListItem = (props: ActionListItemProps) => {
  const activatableRef = useActivatable();
  let handledPressStart = false;

  const handlePressStart = (event: MouseEvent | TouchEvent) => {
    if (!props.onPressStart) return;
    if (event instanceof MouseEvent && event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    handledPressStart = true;
    props.onPressStart();
  };

  const handleClick = () => {
    if (handledPressStart) {
      handledPressStart = false;
      return;
    }

    props.onClick?.();
  };

  return (
    <button
      ref={activatableRef}
      type="button"
      class="action-list-item"
      classList={{
        "action-list-item-with-icon": props.icon !== undefined && props.icon !== null,
        "action-list-item-danger": props.danger,
        [props.class!]: !!props.class,
      }}
      aria-label={props.title}
      onMouseDown={handlePressStart}
      onTouchStart={handlePressStart}
      onClick={handleClick}
    >
      {props.icon && (
        <span
          class="action-list-icon"
          data-tone={props.danger ? "danger" : (props.tone ?? "default")}
          aria-hidden="true"
        >
          {props.icon}
        </span>
      )}
      <span class="action-list-copy">
        <span class="action-list-title">{props.title}</span>
        {props.subtitle && <span class="action-list-subtitle">{props.subtitle}</span>}
      </span>
    </button>
  );
};
