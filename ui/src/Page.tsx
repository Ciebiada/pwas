import { JSX, onMount, onCleanup } from "solid-js";
import { useLocation, useBeforeLeave } from "@solidjs/router";
import "./Page.css";
import { isIOS } from "./platform";
import {
  setIsScrolling,
  setIsScrolled,
  saveScrollPosition,
  getScrollPosition,
} from "./scrollState";

type PageProps = {
  children: JSX.Element;
  header?: JSX.Element;
};

export const Page = (props: PageProps) => {
  let scrollRef: HTMLDivElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  const location = useLocation();
  const savedPosition = getScrollPosition(location.pathname);

  // Set isScrolled immediately based on saved position to prevent header flash during view transitions
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
      const offset = window.outerHeight - window.visualViewport.height;
      scrollRef.style.setProperty("--keyboard-offset", `${offset}px`);
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener(
        "resize",
        handleVisualViewportChange,
      );
      handleVisualViewportChange();
    }

    onCleanup(() => {
      active = false;
      if (window.visualViewport) {
        window.visualViewport.removeEventListener(
          "resize",
          handleVisualViewportChange,
        );
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
