import { Portal } from "solid-js/web";
import {
  createContext,
  useContext,
  createSignal,
  createEffect,
  Show,
  onCleanup,
  batch,
} from "solid-js";
import type { JSX, Accessor, Setter } from "solid-js";
import { BackIcon, CloseIcon, ChevronUpDownIcon } from "./Icons";
import "./Modal.css";
import { useModalStack } from "./useModalStack";
import { useSheetDrag } from "./useSheetDrag";

const MODAL_ANIMATION_DURATION = 400;
const MODAL_FAST_ANIMATION_DURATION = 100;

type ModalContextType = {
  close: (fast?: boolean) => Promise<void>;
  push: (pageId: string, title?: string) => void;
  pop: () => void;
  currentPage: Accessor<string>;
  isRoot: Accessor<boolean>;
  direction: Accessor<"forward" | "backward" | null>;
};

const ModalContext = createContext<ModalContextType>();

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) throw new Error("useModal must be used within a Modal");
  return context;
};

type ModalProps = {
  open: Accessor<boolean>;
  setOpen: Setter<boolean>;
  children: JSX.Element;
  height?: string;
  onClose?: () => void;
  title?: string;
};

export const Modal = (props: ModalProps) => {
  const modalStack = useModalStack(props.title || "");
  const [isVisible, setIsVisible] = createSignal(false);
  const [isClosing, setIsClosing] = createSignal(false);

  const lockScroll = () => {
    document.body.classList.add("modal-open");
    document.documentElement.classList.add("modal-open");
  };

  const unlockScroll = () => {
    document.body.classList.remove("modal-open");
    document.documentElement.classList.remove("modal-open");
  };

  const closeWithAnimation = async (fast?: boolean) => {
    if (isClosing() || !isVisible()) return;

    const duration = fast
      ? MODAL_FAST_ANIMATION_DURATION
      : MODAL_ANIMATION_DURATION;
    setIsClosing(true);

    batch(() => {
      sheet.setAnimationDuration(duration);
      sheet.setModalPosition(window.innerHeight);
      sheet.setDragOffsetY(0);
    });

    props.setOpen(false);

    await new Promise((resolve) => setTimeout(resolve, duration));

    batch(() => {
      modalStack.reset(props.title || "");
      setIsClosing(false);
      setIsVisible(false);
    });
    unlockScroll();
    props.onClose?.();
  };

  const sheet = useSheetDrag(() => closeWithAnimation());

  createEffect(() => {
    const isOpen = props.open();

    if (isOpen) {
      batch(() => {
        sheet.setAnimationDuration(MODAL_ANIMATION_DURATION);
        setIsVisible(true);
        setIsClosing(false);
        sheet.setDragOffsetY(0);
        sheet.setIsDragging(false);
        sheet.setModalPosition(window.innerHeight);
      });

      lockScroll();

      // Ensure the browser acknowledges the starting position before animating
      requestAnimationFrame(() => {
        sheet.setModalPosition(window.innerHeight * 0.5);
      });
    } else if (isVisible() && !isClosing()) {
      closeWithAnimation();
    }
  });

  onCleanup(() => {
    unlockScroll();
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && props.open()) {
      closeWithAnimation();
    }
  };

  createEffect(() => {
    if (props.open()) {
      document.addEventListener("keydown", handleKeyDown);
      onCleanup(() => document.removeEventListener("keydown", handleKeyDown));
    }
  });

  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeWithAnimation();
    }
  };

  const preventTouchMove = (e: TouchEvent) => e.preventDefault();

  return (
    <ModalContext.Provider
      value={{
        close: closeWithAnimation,
        push: modalStack.push,
        pop: modalStack.pop,
        currentPage: modalStack.currentPage,
        isRoot: modalStack.isRoot,
        direction: modalStack.direction,
      }}
    >
      <Show when={isVisible()}>
        <Portal>
          <div
            class="modal-overlay"
            data-expanded={props.open() && !isClosing() ? "" : undefined}
            data-closed={isClosing() ? "" : undefined}
            style={{ "--animation-duration": `${sheet.animationDuration()}ms` }}
            onClick={handleOverlayClick}
            ref={(el) =>
              el.addEventListener("touchmove", preventTouchMove, {
                passive: false,
              })
            }
          />
          <div class="modal-positioner" onClick={handleOverlayClick}>
            <div
              class="modal-content"
              data-expanded={props.open() && !isClosing() ? "" : undefined}
              data-closed={isClosing() ? "" : undefined}
              style={{
                "--animation-duration": `${sheet.animationDuration()}ms`,
                height: `calc(100% - ${sheet.modalPosition() + sheet.dragOffsetY()}px)`,
                transition: sheet.isDragging()
                  ? "none"
                  : `height ${sheet.animationDuration()}ms cubic-bezier(0.36, 0.66, 0.04, 1)`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                class="modal-handle"
                onMouseDown={sheet.handleDragStart}
                onTouchStart={sheet.handleDragStart}
              />
              <div
                class="modal-fixed-header"
                onMouseDown={sheet.handleDragStart}
                onTouchStart={sheet.handleDragStart}
              >
                <button
                  class="header-button"
                  onClick={() =>
                    modalStack.isRoot()
                      ? closeWithAnimation()
                      : modalStack.pop()
                  }
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                  <span
                    class="modal-icon"
                    classList={{ "modal-icon-visible": modalStack.isRoot() }}
                  >
                    <CloseIcon />
                  </span>
                  <span
                    class="modal-icon"
                    classList={{ "modal-icon-visible": !modalStack.isRoot() }}
                  >
                    <BackIcon />
                  </span>
                </button>
                <h2 class="modal-fixed-title">{modalStack.currentTitle()}</h2>
              </div>
              <div class="modal-pages-container">{props.children}</div>
            </div>
          </div>
        </Portal>
      </Show>
    </ModalContext.Provider>
  );
};

type ModalPageProps = {
  id: string;
  children: JSX.Element;
};

export const ModalPage = (props: ModalPageProps) => {
  const { currentPage, direction } = useModal();
  const [isScrollable, setIsScrollable] = createSignal(false);
  let pageRef: HTMLDivElement | undefined;

  const checkScrollable = () => {
    if (pageRef) {
      setIsScrollable(pageRef.scrollHeight > pageRef.clientHeight);
    }
  };

  createEffect(() => {
    if (currentPage() === props.id && pageRef) {
      checkScrollable();

      const observer = new ResizeObserver(checkScrollable);
      observer.observe(pageRef);

      onCleanup(() => observer.disconnect());
    }
  });

  return (
    <Show when={currentPage() === props.id}>
      <div
        ref={pageRef}
        class="modal-page"
        classList={{ "modal-page-scrollable": isScrollable() }}
        data-animate={direction()}
      >
        {props.children}
      </div>
    </Show>
  );
};

type ModalButtonProps = {
  onClick?: (close: (fast?: boolean) => Promise<void>) => void | Promise<void>;
  children: JSX.Element;
  danger?: boolean;
  style?: JSX.CSSProperties;
  class?: string;
};

export const ModalButton = (props: ModalButtonProps) => {
  const { close } = useModal();

  const handleClick = () => {
    props.onClick?.(close);
  };

  return (
    <button
      class="modal-button"
      classList={{
        "modal-button-danger": props.danger,
        [props.class!]: !!props.class,
      }}
      onClick={handleClick}
      style={props.style}
    >
      {props.children}
    </button>
  );
};

type ModalToggleProps = {
  label: string;
  checked: Accessor<boolean>;
  onChange: (checked: boolean) => void;
};

export const ModalToggle = (props: ModalToggleProps) => {
  return (
    <div class="modal-toggle">
      <span class="modal-toggle-label">{props.label}</span>
      <label class="modal-toggle-switch">
        <input
          type="checkbox"
          checked={props.checked()}
          onChange={(e) => props.onChange(e.currentTarget.checked)}
        />
        <span class="modal-toggle-slider"></span>
      </label>
    </div>
  );
};

type ModalSelectProps = {
  label: string;
  value: string | number;
  displayValue?: string | number;
  onChange: (value: string) => void;
  children: JSX.Element;
};

export const ModalSelect = (props: ModalSelectProps) => {
  return (
    <div class="modal-select-wrapper">
      <div class="modal-button">
        <span>{props.label}</span>
        <div class="modal-select-content">
          <span class="modal-select-value">
            {props.displayValue ?? props.value}
          </span>
          <ChevronUpDownIcon />
        </div>
      </div>
      <select
        class="modal-native-select"
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
      >
        {props.children}
      </select>
    </div>
  );
};

type ModalSliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  displayValue?: string;
};

export const ModalSlider = (props: ModalSliderProps) => {
  let sliderRef: HTMLDivElement | undefined;
  const [isSliding, setIsSliding] = createSignal(false);
  const [startX, setStartX] = createSignal(0);
  const [startValue, setStartValue] = createSignal(0);

  const handlePointerDown = (e: PointerEvent) => {
    setIsSliding(true);
    setStartX(e.clientX);
    setStartValue(props.value);
    sliderRef?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!isSliding() || !sliderRef) return;
    const deltaX = e.clientX - startX();
    const rect = sliderRef.getBoundingClientRect();
    const deltaValue = (deltaX / rect.width) * (props.max - props.min);
    const rawValue = startValue() + deltaValue;
    const steppedValue =
      Math.round(rawValue / (props.step ?? 1)) * (props.step ?? 1);
    const finalValue = Math.max(props.min, Math.min(props.max, steppedValue));
    if (finalValue !== props.value) {
      props.onChange(finalValue);
    }
  };

  const handlePointerUp = (e: PointerEvent) => {
    setIsSliding(false);
    sliderRef?.releasePointerCapture(e.pointerId);
  };

  const percentage = () =>
    ((props.value - props.min) / (props.max - props.min)) * 100;

  return (
    <div
      ref={sliderRef}
      class="modal-slider-wrapper modal-button"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        "touch-action": "pan-y",
        "--slider-progress": `${percentage()}%`,
      }}
    >
      <span>{props.label}</span>
      <div class="modal-slider-content">
        <span class="modal-slider-value">
          {props.displayValue ?? props.value}
        </span>
      </div>
    </div>
  );
};
