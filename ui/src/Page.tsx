import { useBeforeLeave, useLocation } from "@solidjs/router";
import { type JSX, onCleanup, onMount } from "solid-js";
import "./Page.css";
import { isIOS } from "./platform";
import { getScrollPosition, saveScrollPosition, setIsScrolled, setIsScrolling } from "./scrollState";

type PageProps = {
  children: JSX.Element;
};

export const Page = (props: PageProps) => {
  let scrollRef: HTMLDivElement | undefined;
  const location = useLocation();
  const savedPosition = getScrollPosition(location.pathname);

  if (savedPosition !== undefined) {
    setIsScrolled(savedPosition > 10);
  }

  useBeforeLeave(() => {
    if (scrollRef) {
      saveScrollPosition(location.pathname, scrollRef.scrollTop);
    }
  });

  onMount(() => {
    setIsScrolling(false);
    let active = true;

    const handleVisualViewportChange = () => {
      if (!scrollRef || !window.visualViewport) return;
      const viewport = window.visualViewport;
      const offset = window.innerHeight - viewport.height;
      const padding = 64; // adding just the keybord height as a bottom padding is enough to be able to scroll to the bottom
      const keyboardValue = `${offset + padding}px`;
      // Distance from layout viewport bottom to visual viewport bottom. When iOS
      // scrolls the page on input focus, the layout viewport bottom falls below
      // the visible area; fixed-positioned bars that use `bottom: 0` follow the
      // layout viewport and end up off-screen. Anchoring to this gap keeps bars
      // pinned to the actual visual bottom (just above the keyboard when up).
      const visualBottomGap = `${Math.max(0, offset - viewport.offsetTop)}px`;
      const [keyboard, gap] = isIOS ? [keyboardValue, visualBottomGap] : ["0px", "0px"];
      // --keyboard-offset is read only inside a Page (Editor's bottom padding),
      // so it stays local on the scroll container. --visual-bottom-gap is read by
      // the root-level SearchBar (outside any Page), so it goes on :root and
      // inherits down via @property(inherits:true) in SearchBar.css.
      scrollRef.style.setProperty("--keyboard-offset", keyboard);
      document.documentElement.style.setProperty("--visual-bottom-gap", gap);
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleVisualViewportChange);
      handleVisualViewportChange();
    }

    onCleanup(() => {
      active = false;
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleVisualViewportChange);
      }
    });

    if (savedPosition !== undefined && scrollRef) {
      // Try to restore immediately
      scrollRef.scrollTop = savedPosition;

      // Also try for a few frames to handle async content loading (e.g. Dexie)
      let attempts = 0;
      const tryRestore = () => {
        if (!active || !scrollRef) return;
        scrollRef.scrollTop = savedPosition;

        // If we reached the target or spent enough time trying
        if (scrollRef.scrollTop >= savedPosition || attempts > 30) {
          setIsScrolled(scrollRef.scrollTop > 10);
          return;
        }

        attempts++;
        requestAnimationFrame(tryRestore);
      };

      tryRestore();
    } else {
      setIsScrolled(scrollRef ? scrollRef.scrollTop > 10 : false);
    }
  });

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        setIsScrolling(true);
        setIsScrolled(e.currentTarget.scrollTop > 10);
      }}
      onscrollend={() => setIsScrolling(false)}
      class="page"
      classList={{
        overscroll: isIOS,
      }}
    >
      {props.children}
    </div>
  );
};
