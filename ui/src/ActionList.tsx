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
    // Retain whatever is currently focused (the editor, or the modal's search
    // field) when pressing an action. Otherwise the press blurs that element and
    // dismisses the iOS keyboard; the dismissal reflows the sheet mid-tap, the
    // button slides out from under the finger, and the tap is lost — so the
    // action only fires on a second tap. preventDefault on mousedown keeps focus
    // while still letting the click through. touchstart is left alone (unless an
    // explicit onPressStart opts in) so the action list stays scrollable.
    if (event instanceof MouseEvent) {
      if (event.button !== 0) return;
      event.preventDefault();
    }

    if (!props.onPressStart) return;

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
