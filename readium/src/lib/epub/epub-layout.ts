import type { LayoutInfo, RendererOptions } from "./epub-types";

export function computeLayoutInfo(
  options: RendererOptions,
  overrides?: { containerWidth?: number; containerHeight?: number },
): LayoutInfo {
  const containerWidth = overrides?.containerWidth ?? options.container.clientWidth;
  const containerHeight = overrides?.containerHeight ?? options.container.clientHeight;
  const margin = options.margin;

  const isTwoColumn = containerWidth > containerHeight;
  const gap = isTwoColumn && margin === 0 ? 16 : margin;

  const columnWidth = isTwoColumn ? Math.floor((containerWidth - margin * 2 - gap) / 2) : containerWidth - margin * 2;

  const singleColumnStride = columnWidth + gap;
  const pageStride = singleColumnStride * (isTwoColumn ? 2 : 1);

  return {
    columnWidth,
    gap,
    pageStride,
    containerWidth,
    margin,
    isTwoColumn,
  };
}
