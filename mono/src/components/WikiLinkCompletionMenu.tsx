import { type Accessor, For, Show } from "solid-js";
import type { WikiCompletionOption, WikiCompletionPosition } from "../hooks/useWikiLinkCompletion";
import "./WikiLinkCompletionMenu.css";

type WikiLinkCompletionMenuProps = {
  onSelect: (option: WikiCompletionOption) => void;
  options: Accessor<WikiCompletionOption[]>;
  position: Accessor<WikiCompletionPosition | null>;
  selectedIndex: Accessor<number>;
  setRef: (element: HTMLDivElement) => void;
  visible: Accessor<boolean>;
};

export const WikiLinkCompletionMenu = (props: WikiLinkCompletionMenuProps) => (
  <Show when={props.visible()}>
    <div
      ref={props.setRef}
      class="wiki-link-completion"
      data-direction={props.position()?.direction}
      style={{
        left: `${props.position()?.left ?? 0}px`,
        top: `${props.position()?.top ?? 0}px`,
        visibility: props.position() ? "visible" : "hidden",
      }}
      contentEditable={false}
    >
      <For each={props.options()}>
        {(option, index) => (
          <button
            type="button"
            classList={{ selected: index() === props.selectedIndex() }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => props.onSelect(option)}
          >
            <span>{option.title}</span>
            <Show when={option.create}>
              <span class="wiki-link-create-label">Create</span>
            </Show>
          </button>
        )}
      </For>
    </div>
  </Show>
);
