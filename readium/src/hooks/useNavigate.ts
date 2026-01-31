import { useNavigate as _useNavigate, useIsRouting } from "@solidjs/router";
import "./transitions.css";

const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 10));

const asyncSpinLock = async (predicate: () => boolean) => {
  while (predicate()) {
    await yieldToEventLoop();
  }
};

export const useNavigate = () => {
  const navigate = _useNavigate();
  const isRouting = useIsRouting();

  return (path: string | number, options?: { back?: boolean; replace?: boolean }) => {
    const executeNavigation = async () => {
      if (typeof path === "number") {
        if (path === -1 && window.history.length <= 2) {
          navigate("/", { replace: true });
          return;
        }
        navigate(path);
        if ("startViewTransition" in document) {
          await yieldToEventLoop();
        }
        return;
      }
      navigate(path, { replace: options?.replace });
    };

    if (!document.startViewTransition) {
      executeNavigation();
      return;
    }

    const transition = document.startViewTransition(async () => {
      await executeNavigation();
      await asyncSpinLock(isRouting);
    });

    if (options?.back) {
      transition.types?.add("back-transition");
    }
  };
};
