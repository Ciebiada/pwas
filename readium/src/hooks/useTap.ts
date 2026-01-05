export const useTap = (onTap: (e: PointerEvent) => void) => {
  let startX = 0;
  let startY = 0;
  let startTime = 0;

  const onPointerDown = (e: PointerEvent) => {
    startX = e.clientX;
    startY = e.clientY;
    startTime = Date.now();
  };

  const onPointerUp = (e: PointerEvent) => {
    const diffX = Math.abs(e.clientX - startX);
    const diffY = Math.abs(e.clientY - startY);
    const timeDiff = Date.now() - startTime;

    if (diffX < 10 && diffY < 10 && timeDiff < 500) {
      onTap(e);
    }
  };

  return { onPointerDown, onPointerUp };
};
