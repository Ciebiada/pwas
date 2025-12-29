import { createSignal, batch } from "solid-js";

const MODAL_ANIMATION_DURATION = 400;

export const useSheetDrag = (onClose: () => void) => {
  const [modalPosition, setModalPosition] = createSignal(window.innerHeight);
  const [dragOffsetY, setDragOffsetY] = createSignal(0);
  const [isDragging, setIsDragging] = createSignal(false);
  const [animationDuration, setAnimationDuration] = createSignal(
    MODAL_ANIMATION_DURATION,
  );

  let startY = 0;
  let lastY = 0;
  let lastTime = 0;
  let prevY = 0;
  let prevTime = 0;

  const handleDragStart = (e: TouchEvent | MouseEvent) => {
    setIsDragging(true);
    const now = Date.now();
    lastTime = now;
    prevTime = now;

    if ("touches" in e) {
      startY = e.touches[0].clientY;
      lastY = startY;
      prevY = startY;
      window.addEventListener("touchmove", handleDragMove, { passive: false });
      window.addEventListener("touchend", handleDragEnd);
    } else {
      startY = e.clientY;
      lastY = startY;
      prevY = startY;
      window.addEventListener("mousemove", handleDragMove);
      window.addEventListener("mouseup", handleDragEnd);
    }
  };

  const handleDragMove = (e: TouchEvent | MouseEvent) => {
    if (!isDragging()) return;

    let clientY: number;
    if ("touches" in e) {
      e.preventDefault();
      clientY = e.touches[0].clientY;
    } else {
      clientY = e.clientY;
    }

    const deltaY = clientY - startY;
    const now = Date.now();
    if (now > lastTime) {
      prevY = lastY;
      prevTime = lastTime;
      lastY = clientY;
      lastTime = now;
    }

    const potentialPosition = modalPosition() + deltaY;
    setDragOffsetY(potentialPosition < 0 ? -modalPosition() : deltaY);
  };

  const handleDragEnd = () => {
    const screenHeight = window.innerHeight;
    const currentPosition = modalPosition() + dragOffsetY();
    const dt = lastTime - prevTime;
    const velocity = dt > 0 ? (lastY - prevY) / dt : 0;

    const flickThreshold = 0.5;
    const isFlickUp = velocity < -flickThreshold;
    const isFlickDown = velocity > flickThreshold;

    const dismissThreshold = screenHeight * 0.75;
    const fullScreenThreshold = screenHeight * 0.25;

    window.removeEventListener("mousemove", handleDragMove);
    window.removeEventListener("mouseup", handleDragEnd);
    window.removeEventListener("touchmove", handleDragMove);
    window.removeEventListener("touchend", handleDragEnd);

    batch(() => {
      setIsDragging(false);
      setAnimationDuration(MODAL_ANIMATION_DURATION);

      if (isFlickDown) {
        if (modalPosition() === 0) setModalPosition(screenHeight * 0.5);
        else onClose();
        setDragOffsetY(0);
      } else if (isFlickUp) {
        if (modalPosition() > 0) setModalPosition(0);
        setDragOffsetY(0);
      } else if (currentPosition > dismissThreshold) {
        onClose();
      } else if (currentPosition < fullScreenThreshold) {
        setModalPosition(0);
        setDragOffsetY(0);
      } else {
        setModalPosition(screenHeight * 0.5);
        setDragOffsetY(0);
      }
    });
  };

  return {
    modalPosition,
    setModalPosition,
    dragOffsetY,
    setDragOffsetY,
    isDragging,
    setIsDragging,
    animationDuration,
    setAnimationDuration,
    handleDragStart,
  };
};
