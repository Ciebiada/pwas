import type { LayoutInfo, RendererOptions } from "./epub-types";

const ZERO_MARGIN_GLYPH_GUARD = 4;

export function computeLayoutInfo(
  options: RendererOptions,
  overrides?: { containerWidth?: number; containerHeight?: number },
): LayoutInfo {
  const containerWidth = overrides?.containerWidth ?? options.container.clientWidth;
  const containerHeight = overrides?.containerHeight ?? options.container.clientHeight;
  const margin = options.margin;

  const isTwoColumn = containerWidth > containerHeight;
  const zeroMarginGap = Math.max(4, Math.ceil((options.fontSize / 100) * ZERO_MARGIN_GLYPH_GUARD));
  const gap = isTwoColumn ? (margin === 0 ? 16 : margin) : margin === 0 ? zeroMarginGap : margin * 2;

  const columnWidth = isTwoColumn ? (containerWidth - margin * 2 - gap) / 2 : containerWidth - margin * 2;

  const pageStride = columnWidth + gap;

  return {
    columnWidth,
    gap,
    pageStride,
    containerWidth,
    margin,
    isTwoColumn,
  };
}
