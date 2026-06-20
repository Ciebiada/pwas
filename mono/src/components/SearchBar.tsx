import { useLocation } from "@solidjs/router";
import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { SearchIcon } from "ui/Icons";
import { useActivatable } from "ui/useActivatable";
import { useIOSKeyboardFocus } from "ui/useIOSKeyboardFocus";
import { searchQuery, setSearchQuery } from "../services/searchStore";
import "./SearchBar.css";

const SEARCH_ICON_WIDTH = 18;
const SEARCH_FLEX_GAP = 8;
const SEARCH_BAR_HORIZONTAL_PADDING = 14;
// Total non-text width inside the search pill: icon + gap + horizontal padding.
const SEARCH_BAR_CHROME = SEARCH_ICON_WIDTH + 2 * (SEARCH_FLEX_GAP + SEARCH_BAR_HORIZONTAL_PADDING);

// Persistent, app-level search bar for the notes list.
//
// It is rendered once at the router root (not inside NotesList) so it is a single
// instance that never remounts across route changes. The page view transition
// then *morphs* it between positions (up on the list, down off-screen elsewhere)
// via its view-transition-name, which reads as a slide. Note this is the inverse
// of the header (which is re-rendered per page and morphs by reusing its name
// across remounts): for this element a remount leaves a stale WebKit snapshot
// that made the list-local version animate only once before reloading, so it is
// hoisted to the root to avoid ever remounting.
export const SearchBar = () => {
  const location = useLocation();
  const [searchKeyboardActive, setSearchKeyboardActive] = createSignal(false);

  const onList = () => location.pathname === "/";

  let searchInputRef: HTMLInputElement | undefined;
  let searchLabelRef: HTMLLabelElement | undefined;
  const [collapsedWidth, setCollapsedWidth] = createSignal<string>();
  const [animate, setAnimate] = createSignal(false);
  const [dirtyContentWidth, setDirtyContentWidth] = createSignal(0);
  let measureSpan: HTMLSpanElement | undefined;

  onMount(() => {
    requestAnimationFrame(() => {
      if (!searchLabelRef) return;
      const bar = searchLabelRef;
      const input = bar.querySelector(".notes-search-input") as HTMLInputElement | null;
      if (!input) return;

      const cs = getComputedStyle(input);
      measureSpan = document.createElement("span");
      measureSpan.style.font = cs.font;
      measureSpan.style.letterSpacing = cs.letterSpacing;
      measureSpan.style.wordSpacing = cs.wordSpacing;
      measureSpan.style.whiteSpace = "pre";
      measureSpan.style.position = "absolute";
      measureSpan.style.visibility = "hidden";
      document.body.appendChild(measureSpan);

      measureSpan.textContent = input.placeholder;
      const textWidth = measureSpan.getBoundingClientRect().width;
      setCollapsedWidth(`${Math.ceil(textWidth + SEARCH_BAR_CHROME)}px`);
    });
  });
  const keyboard = useIOSKeyboardFocus({ getTargetInput: () => searchInputRef });

  // Reset the query when leaving the list so a stale search isn't waiting on
  // return (matches the old behavior where the bar unmounted with the page).
  createEffect(() => {
    if (!onList()) setSearchQuery("");
  });

  // `/` focuses the search bar when on the list and no input is active.
  createEffect(() => {
    if (!onList()) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      e.preventDefault();
      setAnimate(true);
      setSearchKeyboardActive(true);
      keyboard.focusInput();
    };
    document.addEventListener("keydown", handler);
    onCleanup(() => document.removeEventListener("keydown", handler));
  });

  // Mirror the NoteActionsModal focus trick: focus an off-screen proxy first so
  // iOS summons the keyboard in response to the user's tap, then immediately
  // re-focus the real input. The visible bar is what the user tapped, so the
  // browser doesn't try to scroll the layout to bring the input into view.
  // setSearchKeyboardActive(true) is set here (and in handleClear and the "/"
  // shortcut) rather than in onFocus, so iOS's PWA focus restoration after an
  // app switch — which re-focuses the input without opening the keyboard —
  // doesn't expand the bar.
  const activatable = useActivatable({
    fastRelease: true,
    onTap: (e) => {
      const target = e.target as HTMLElement;
      if (target.closest(".notes-search-clear")) return;
      e.preventDefault();
      setAnimate(true);
      setSearchKeyboardActive(true);
      if (document.activeElement === searchInputRef) {
        keyboard.focusInput();
        return;
      }
      keyboard.focusProxy();
      keyboard.focusInputSoon();
    },
  });

  const handleSearchBlur = () => {
    // The collapsed pill width (labelStyle's max-width) is only applied once the
    // keyboard closes, so measure here at blur rather than on every keystroke —
    // a getBoundingClientRect per key would force a reflow each time. Both writes
    // flush together, so the bar still animates from expanded to the measured width.
    const q = searchQuery().trim();
    if (q && measureSpan) {
      measureSpan.textContent = q;
      setDirtyContentWidth(Math.ceil(measureSpan.getBoundingClientRect().width + SEARCH_BAR_CHROME));
    } else {
      setDirtyContentWidth(0);
    }
    setSearchKeyboardActive(false);
    setTimeout(() => {
      if (keyboard.isEitherFocused()) return;
      keyboard.clearTimer();
    }, 0);
  };

  const hasText = () => searchQuery().trim().length > 0;

  const handleClear = (e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSearchQuery("");
    setSearchKeyboardActive(true);
    keyboard.focusInput();
  };

  onCleanup(() => {
    if (measureSpan) {
      document.body.removeChild(measureSpan);
      measureSpan = undefined;
    }
  });

  // iOS can close the keyboard without firing onBlur (app switch → return, or
  // the keyboard's own dismiss key). Without this, searchKeyboardActive stays
  // true while --visual-bottom-gap drops to 0, leaving the bar pinned at the
  // bottom edge and fully expanded. Page.tsx tracks the real keyboard state via
  // visualViewport and dispatches "keyboard-closed" on open→closed transitions;
  // we listen and reset. The app-switch case is handled by Page.tsx blurring the
  // active element on visibilitychange(hidden), which fires onBlur directly.
  onMount(() => {
    const onKeyboardClosed = () => {
      if (searchKeyboardActive()) handleSearchBlur();
    };
    document.addEventListener("keyboard-closed", onKeyboardClosed);
    onCleanup(() => document.removeEventListener("keyboard-closed", onKeyboardClosed));
  });

  const labelStyle = createMemo(() => {
    const style: Record<string, string> = {
      "--cw": collapsedWidth() ?? "",
      visibility: collapsedWidth() ? "visible" : "hidden",
    };
    if (hasText() && !searchKeyboardActive()) {
      style["max-width"] = `${dirtyContentWidth()}px`;
    }
    return style;
  });

  return (
    <>
      <input
        ref={keyboard.proxyRef}
        class="notes-search-focus-proxy"
        type="search"
        aria-hidden="true"
        autocorrect="off"
        autocapitalize="off"
        tabindex="-1"
      />
      <div class="notes-search-wrapper" classList={{ "keyboard-active": searchKeyboardActive(), up: onList() }}>
        <label
          ref={(el) => {
            searchLabelRef = el;
            activatable(el);
          }}
          class="notes-search"
          classList={{ expanded: searchKeyboardActive(), animate: animate(), dirty: hasText() }}
          style={labelStyle()}
        >
          <span class="notes-search-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            ref={searchInputRef}
            type="search"
            class="notes-search-input"
            value={searchQuery()}
            placeholder="Search"
            aria-label="Search notes"
            autocorrect="off"
            autocapitalize="off"
            onBlur={() => {
              // Skip spurious blurs from the proxy→input focus transition: if the
              // input or proxy still has focus, the blur didn't come from the user
              // leaving the field. Without this guard, searchKeyboardActive is set
              // to false prematurely, and the later keyboard-closed event (from
              // app switch) finds active already false and skips the reset.
              if (keyboard.isEitherFocused()) return;
              handleSearchBlur();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                searchInputRef?.blur();
              }
            }}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
          />
          {searchKeyboardActive() && hasText() && (
            <button
              type="button"
              class="notes-search-clear"
              aria-label="Clear search"
              onMouseDown={handleClear}
              onTouchStart={handleClear}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
          )}
        </label>
      </div>
    </>
  );
};
