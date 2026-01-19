import { createSignal } from "solid-js";

export const [isScrolling, setIsScrolling] = createSignal(false);
export const [isScrolled, setIsScrolled] = createSignal(false);

const scrollPositions = new Map<string, number>();

export const saveScrollPosition = (path: string, position: number) => {
  scrollPositions.set(path, position);
};

export const getScrollPosition = (path: string) => {
  return scrollPositions.get(path);
};
