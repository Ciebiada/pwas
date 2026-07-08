import { onCleanup, onMount } from "solid-js";
import { isIOS } from "./platform";

const KEYBOARD_OPEN_THRESHOLD = 100;

// Manages iOS keyboard viewport compensation. Sets two CSS variables:
// --keyboard-scroll-padding on the scroll container and --visual-bottom-gap on
// :root (root-level fixed bars like SearchBar). Also:
// - Prevents the layout from sliding up on keyboard type switches (text ↔
//   emoji) by snapping window.scrollY back to 0 while the keyboard is open.
// - Dispatches a "keyboard-closed" event when the keyboard closes without a
//   blur (dismiss key, app switch), so components like SearchBar can reset.
// - Blurs the active element when going to background so iOS's PWA focus
//   restoration doesn't re-focus it and re-open the keyboard on return.
export const useIOSKeyboardViewport = (getScrollRef: () => HTMLDivElement | undefined) => {
  onMount(() => {
    let keyboardOpen = false;

    const handleVisualViewportChange = () => {
      const scrollRef = getScrollRef();
      if (!scrollRef || !window.visualViewport) return;
      const viewport = window.visualViewport;
      const offset = window.innerHeight - viewport.height;
      const wasOpen = keyboardOpen;
      keyboardOpen = offset > KEYBOARD_OPEN_THRESHOLD;
      if (wasOpen && !keyboardOpen) {
        document.dispatchEvent(new CustomEvent("keyboard-closed"));
      }
      // While the keyboard is open, iOS scrolls the window up on internal
      // keyboard changes (text ↔ emoji) to keep the caret above the taller
      // emoji keyboard (WebKit r271828). That slides the whole layout up and
      // makes offsetTop non-zero, which breaks the gap formula below. The body
      // is position:fixed and content scrolls inside .page, so window.scrollY
      // is normally 0 — snap it back so the layout stays put and offsetTop
      // stays 0. offset (= innerH - vvH) is invariant to the layout scroll, so
      // using offsetTop=0 here yields the correct gap even before innerH/vvH
      // settle back from the snap.
      let offsetTop = viewport.offsetTop;
      if (isIOS && keyboardOpen && offsetTop > 0) {
        window.scrollTo(0, 0);
        offsetTop = 0;
      }
      const keyboardValue = `${offset}px`;
      // Distance from layout viewport bottom to visual viewport bottom. When iOS
      // scrolls the page on input focus, the layout viewport bottom falls below
      // the visible area; fixed-positioned bars that use `bottom: 0` follow the
      // layout viewport and end up off-screen. Anchoring to this gap keeps bars
      // pinned to the actual visual bottom (just above the keyboard when up).
      const visualBottomGap = `${Math.max(0, offset - offsetTop)}px`;
      const [keyboard, gap] = isIOS ? [keyboardValue, visualBottomGap] : ["0px", "0px"];
      scrollRef.style.setProperty("--keyboard-scroll-padding", keyboard);
      document.documentElement.style.setProperty("--visual-bottom-gap", gap);
      if (isIOS) {
        document.documentElement.classList.toggle("keyboard-open", keyboardOpen);
      }
    };

    // Safety net: if iOS scrolls the window while the keyboard is open (e.g. the
    // emoji switch fires a `scroll` before `visualViewport.resize`), snap back.
    const preventLayoutScroll = () => {
      if (keyboardOpen && window.scrollY > 0) {
        window.scrollTo(0, 0);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleVisualViewportChange);
      handleVisualViewportChange();
    }
    if (isIOS) {
      window.addEventListener("scroll", preventLayoutScroll, { passive: true });
    }

    // When going to background, blur the active element so iOS has nothing to
    // restore focus to on return. Without this, iOS's PWA focus restoration
    // re-focuses the last focused input/editor on return, which opens the
    // keyboard and scrolls the page — even if the user wasn't focused when they
    // switched away. On return, re-check the viewport in case a resize fired
    // while backgrounded and was missed. iOS-only: on desktop, blurring on tab
    // switch would lose focus unexpectedly.
    const handleVisibilityChange = () => {
      if (document.hidden) {
        const el = document.activeElement;
        if (el && el !== document.body) {
          (el as HTMLElement).blur();
        }
        return;
      }
      handleVisualViewportChange();
    };
    if (isIOS) {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    onCleanup(() => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleVisualViewportChange);
      }
      if (isIOS) {
        window.removeEventListener("scroll", preventLayoutScroll);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        document.documentElement.classList.remove("keyboard-open");
      }
    });
  });
};
