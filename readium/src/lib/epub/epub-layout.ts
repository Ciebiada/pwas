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

  const columnWidth = isTwoColumn ? (containerWidth - margin * 2 - gap) / 2 : containerWidth - margin * 2;

  const pageStride = isTwoColumn ? columnWidth + gap : containerWidth;

  return {
    columnWidth,
    gap,
    pageStride,
    containerWidth,
    margin,
    isTwoColumn,
  };
}
