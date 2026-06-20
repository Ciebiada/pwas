import { useBeforeLeave, useLocation } from "@solidjs/router";
import { type JSX, onCleanup, onMount } from "solid-js";
import "./Page.css";
import { isIOS } from "./platform";
import { getScrollPosition, saveScrollPosition, setIsScrolled, setIsScrolling } from "./scrollState";
import { useIOSKeyboardViewport } from "./useIOSKeyboardViewport";

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

  useIOSKeyboardViewport(() => scrollRef);

  onMount(() => {
    setIsScrolling(false);
    let active = true;

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

    onCleanup(() => {
      active = false;
    });
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
