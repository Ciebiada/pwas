import { createSignal, batch } from "solid-js";

export const useModalStack = (initialTitle: string) => {
  const [pageStack, setPageStack] = createSignal<string[]>(["root"]);
  const [direction, setDirection] = createSignal<"forward" | "backward" | null>(
    null,
  );
  const [currentTitle, setCurrentTitle] = createSignal(initialTitle);

  const push = (pageId: string, title?: string) => {
    setDirection("forward");
    setPageStack((prev) => [...prev, pageId]);
    if (title) setCurrentTitle(title);
  };

  const pop = () => {
    if (pageStack().length > 1) {
      setDirection("backward");
      setPageStack((prev) => prev.slice(0, -1));
      setCurrentTitle(initialTitle);
    }
  };

  const reset = (title: string) => {
    batch(() => {
      setPageStack(["root"]);
      setDirection(null);
      setCurrentTitle(title);
    });
  };

  const currentPage = () => pageStack()[pageStack().length - 1];
  const isRoot = () => pageStack().length === 1;

  return {
    pageStack,
    direction,
    currentTitle,
    push,
    pop,
    reset,
    currentPage,
    isRoot,
  };
};
