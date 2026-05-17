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
};

export const ActionList = (props: ActionListProps) => <div class="action-list">{props.children}</div>;

export const ActionListItem = (props: ActionListItemProps) => {
  const activatableRef = useActivatable();

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
      onClick={() => props.onClick?.()}
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
