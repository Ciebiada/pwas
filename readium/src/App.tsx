import { createEffect, createSignal, onCleanup } from "solid-js";
import { UpdateToast } from "./components/UpdateToast";
import { settings } from "./store/settings";
import "./App.css";

import type { ParentProps } from "solid-js";

const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");
const reduceMotionScheme = window.matchMedia("(prefers-reduced-motion: reduce)");

const getEffectiveTheme = (theme: string, systemDark: boolean) => {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
};

const setStatusBarColor = (color: string) => {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');

  for (const meta of metas) {
    meta.content = color;
  }
};

const App = (props: ParentProps) => {
  const [systemDark, setSystemDark] = createSignal(darkScheme.matches);
  const [systemReduceMotion, setSystemReduceMotion] = createSignal(reduceMotionScheme.matches);

  const handleSchemeChange = (event: MediaQueryListEvent) => {
    setSystemDark(event.matches);
  };

  const handleReduceMotionChange = (event: MediaQueryListEvent) => {
    setSystemReduceMotion(event.matches);
  };

  darkScheme.addEventListener("change", handleSchemeChange);
  reduceMotionScheme.addEventListener("change", handleReduceMotionChange);
  onCleanup(() => {
    darkScheme.removeEventListener("change", handleSchemeChange);
    reduceMotionScheme.removeEventListener("change", handleReduceMotionChange);
  });

  createEffect(() => {
    const currentSettings = settings();
    const theme = currentSettings.theme;
    const effectiveTheme = getEffectiveTheme(theme, systemDark());
    const reduceMotion = currentSettings.reduceMotion || systemReduceMotion();

    document.documentElement.dataset.theme = theme;
    document.documentElement.toggleAttribute("data-reduce-motion", reduceMotion);
    setStatusBarColor(effectiveTheme === "dark" ? "#000000" : "#ffffff");
  });

  return (
    <>
      {props.children}
      <UpdateToast />
    </>
  );
};

export default App;
