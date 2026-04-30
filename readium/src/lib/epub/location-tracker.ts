import { CFIHelper } from "./epub-cfi";
import { computeLayoutInfo } from "./epub-layout";
import type { EpubLocation, EpubPackage, RendererOptions } from "./epub-types";

export class LocationTracker {
  private totalBookSize: number = 0;
  private cumulativeSizes: number[] = [];
  private normalizedSpineSizes: number[] = [];

  constructor(private packageData: EpubPackage) {
    this.calculateBookSize();
  }

  private calculateBookSize() {
    let currentTotal = 0;
    this.normalizedSpineSizes = this.packageData.spine.map((item) => this.getNormalizedSpineSize(item.size));
    this.cumulativeSizes = this.normalizedSpineSizes.map((size) => {
      const start = currentTotal;
      currentTotal += size;
      return start;
    });
    this.totalBookSize = currentTotal;
  }

  private getNormalizedSpineSize(size: number | undefined) {
    return Math.max(size || 0, 1);
  }

  getPercentageForPosition(currentSpineIndex: number, currentPage: number, totalPages: number) {
    if (!this.packageData.spine[currentSpineIndex] || this.totalBookSize <= 0) return 0;

    const chapterBaseSize = this.cumulativeSizes[currentSpineIndex] || 0;
    const chapterPercentage = totalPages > 1 ? currentPage / (totalPages - 1) : 0;
    const chapterSize = this.normalizedSpineSizes[currentSpineIndex] || 1;

    return ((chapterBaseSize + chapterPercentage * chapterSize) / this.totalBookSize) * 100;
  }

  getSpinePositionForPercentage(percentage: number) {
    if (this.packageData.spine.length === 0 || this.totalBookSize <= 0) {
      return { spineIndex: 0, pageRatio: 0 };
    }

    const clamped = Math.max(0, Math.min(100, percentage));
    const targetSize = (clamped / 100) * this.totalBookSize;

    let low = 0;
    let high = this.packageData.spine.length - 1;
    let spineIndex = high;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const start = this.cumulativeSizes[mid] || 0;
      const size = this.normalizedSpineSizes[mid] || 1;
      const end = start + size;

      if (targetSize <= end || mid === this.packageData.spine.length - 1) {
        spineIndex = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    const spineStart = this.cumulativeSizes[spineIndex] || 0;
    const spineSize = this.normalizedSpineSizes[spineIndex] || 1;
    const rawRatio = (targetSize - spineStart) / spineSize;

    return {
      spineIndex,
      pageRatio: Math.max(0, Math.min(rawRatio, 1)),
    };
  }

  getCurrentLocation(
    contentElement: HTMLElement | null,
    currentPage: number,
    totalPages: number,
    currentSpineIndex: number,
    options: RendererOptions,
    basicOnly: boolean = false,
    layoutWidth?: number,
  ): EpubLocation | null {
    const currentSpineItem = this.packageData.spine[currentSpineIndex];
    if (!currentSpineItem) return null;

    const globalProgress = this.getPercentageForPosition(currentSpineIndex, currentPage, totalPages);
    const displayed = {
      page: currentPage + 1,
      total: totalPages,
      spineIndex: currentSpineIndex,
      spineTotal: this.packageData.spine.length,
      percentage: globalProgress,
    };

    if (basicOnly) {
      return { basic: true, start: { displayed } };
    }

    const element = this.getFirstVisibleElement(contentElement, options, layoutWidth);
    if (!element || !contentElement) return { start: { displayed } };

    const contentRect = contentElement.getBoundingClientRect();
    const { pageStride, margin } = computeLayoutInfo(options, { containerWidth: layoutWidth });

    const dpr = (globalThis as unknown as { devicePixelRatio?: number }).devicePixelRatio ?? 1;
    const fuzzPx = Math.max(2, Math.min(10, dpr * 2));
    const visibleMin = currentPage * pageStride + margin;

    // Calculate offset if element starts off-screen (to the left of current visible column)
    let offset = 0;
    const rects = element.getClientRects();
    const rect = rects && rects.length > 0 ? rects[0] : element.getBoundingClientRect();
    const elementLeftInContent = rect.left - contentRect.left;

    if (elementLeftInContent < visibleMin - fuzzPx) {
      offset = this.findFirstVisibleCharOffset(element, contentElement, currentPage, options, layoutWidth);
    }

    const cfi = CFIHelper.generate(currentSpineIndex, element, contentElement, offset);

    return {
      start: {
        cfi,
        displayed,
      },
    };
  }

  private findFirstVisibleCharOffset(
    element: Element,
    contentElement: HTMLElement,
    currentPage: number,
    options: RendererOptions,
    layoutWidth?: number,
  ): number {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const contentRect = contentElement.getBoundingClientRect();
    const { columnWidth, pageStride, margin } = computeLayoutInfo(options, { containerWidth: layoutWidth });

    // The current visible range in content coordinates
    const visibleMin = currentPage * pageStride + margin;
    const visibleMax = visibleMin + columnWidth;

    const dpr = (globalThis as unknown as { devicePixelRatio?: number }).devicePixelRatio ?? 1;
    const fuzzPx = Math.max(2, Math.min(10, dpr * 2));

    let node: Node | null;
    let cumulativeOffset = 0;

    while ((node = walker.nextNode())) {
      const textNode = node as Text;
      const len = textNode.length;
      const range = document.createRange();

      // Check if node starts in or after the current page
      // Use getClientRects to handle nodes spanning columns
      const rects = textNode.parentElement?.getClientRects();
      const firstRect = rects && rects.length > 0 ? rects[0] : null;
      const textLeft = firstRect ? firstRect.left - contentRect.left : 0;

      if (textLeft > visibleMax) {
        // Optimization: Node is entirely after the visible area
        break;
      }

      // Binary Search for the first visible character
      let low = 0;
      let high = len - 1;
      let firstVisible = -1;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        try {
          range.setStart(textNode, mid);
          range.setEnd(textNode, mid + 1);
          const charRect = range.getBoundingClientRect();

          if (charRect.width === 0) {
            // Likely zero-width space or similar, skip
            low = mid + 1;
            continue;
          }

          const charLeft = charRect.left - contentRect.left;

          if (charLeft < visibleMin - fuzzPx) {
            low = mid + 1;
          } else {
            firstVisible = mid;
            high = mid - 1;
          }
        } catch {
          low = mid + 1;
        }
      }

      if (firstVisible !== -1) {
        return cumulativeOffset + firstVisible;
      }
      cumulativeOffset += len;
    }
    return 0;
  }

  getFirstVisibleElement(
    contentElement: HTMLElement | null,
    options: RendererOptions,
    layoutWidth?: number,
  ): Element | null {
    if (!contentElement) return null;

    const containerRect = options.container.getBoundingClientRect();
    const margin = options.margin;

    // Probe point: bit into the first column
    const probeX = containerRect.left + margin + 10;
    const probeY = containerRect.top + margin + 10;

    // Use elementsFromPoint to see through overlays (like nav-zone)
    const targets = document.elementsFromPoint(probeX, probeY);

    // Find the first element that is a descendant of contentElement
    // but not a generic structural container.
    const element = targets.find(
      (t) =>
        contentElement.contains(t) &&
        t !== contentElement &&
        !["div", "section", "article", "body"].includes(t.tagName.toLowerCase()),
    );

    if (element) return element;

    // Fallback: iterate through children to find the first visible one
    const candidates = contentElement.querySelectorAll("p, h1, h2, h3, h4, h5, h6, img, li");
    const rightEdge = layoutWidth ? containerRect.left + layoutWidth : containerRect.right;

    for (const cand of Array.from(candidates)) {
      const rect = cand.getBoundingClientRect();
      // Element is visible if its left edge is within the visible column
      if (rect.left >= containerRect.left - 5 && rect.left < rightEdge - margin) {
        return cand;
      }
    }

    return contentElement;
  }

  getVirtualOffsetLeft(element: Element, contentElement: HTMLElement | null): number {
    if (!contentElement) return 0;
    // Use getClientRects()[0] instead of getBoundingClientRect() for multi-column layouts.
    // getBoundingClientRect() returns a rect spanning all columns the element appears in,
    // but getClientRects() returns individual rects per column fragment.
    const rects = element.getClientRects();
    const rect = rects && rects.length > 0 ? rects[0] : element.getBoundingClientRect();
    const contentRect = contentElement.getBoundingClientRect();
    return rect.left - contentRect.left;
  }
}
