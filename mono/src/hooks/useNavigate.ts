import { useNavigate as _useNavigate, useIsRouting } from "@solidjs/router";
import "./transitions.css";

const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 0));

const asyncSpinLock = async (predicate: () => boolean) => {
  while (predicate()) {
    await yieldToEventLoop();
  }
};

export const useNavigate = () => {
  const navigate = _useNavigate();
  const isRouting = useIsRouting();

  return (path: string, options?: { back?: boolean; replace?: boolean }) => {
    if (!document.startViewTransition)
      return navigate(path, { replace: options?.replace });

    const transition = document.startViewTransition(async () => {
      navigate(path, { replace: options?.replace });
      await asyncSpinLock(isRouting);
    });

    if (options?.back) {
      transition.types?.add("back-transition");
    }
  };
};
