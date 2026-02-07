import { type CFI, CFIHelper } from "./epub-cfi";
import type { EpubParser } from "./epub-parser";
import { EpubStyler } from "./epub-styler";
import type { EpubLocation, EpubPackage, RendererOptions } from "./epub-types";
import { LocationTracker } from "./location-tracker";
import { ResourceResolver } from "./resource-resolver";

export class EpubRenderer {
  private parser: EpubParser;
  private package: EpubPackage;
  private options: RendererOptions;

  private resourceResolver: ResourceResolver;
  private epubStyler: EpubStyler;
  private locationTracker: LocationTracker;

  private currentSpineIndex: number = 0;
  private currentPage: number = 0;
  private totalPages: number = 0;
  private lastKnownCfi: string | undefined;

  private shadowHost: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private contentElement: HTMLElement | null = null;

  private isBusy: boolean = false;
  private resizeObserver: ResizeObserver;
  private onRelocated?: (location: EpubLocation) => void;

  constructor(parser: EpubParser, packageData: EpubPackage, options: RendererOptions) {
    this.parser = parser;
    this.package = packageData;
    this.options = options;

    this.resourceResolver = new ResourceResolver(parser);
    this.epubStyler = new EpubStyler(parser, this.resourceResolver);
    this.locationTracker = new LocationTracker(packageData);

    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(this.options.container);
  }

  setOnRelocated(callback: (location: EpubLocation) => void) {
    this.onRelocated = callback;
  }

  async display(target?: string | number): Promise<void> {
    if (this.isBusy) return;
    this.isBusy = true;

    try {
      if (typeof target === "string" && target.startsWith("epubcfi(")) {
        // Suppress intermediate paint during initial restore to avoid flashing page 0.
        await this.displayCFI(target, true, true);
      } else if (typeof target === "number") {
        await this.displaySpineIndex(target, true);
      } else {
        await this.displaySpineIndex(0, true);
      }
    } finally {
      this.isBusy = false;
      this.notifyRelocated(false);
    }
  }

  private getLayoutInfo() {
    const containerWidth = this.options.container.clientWidth;
    const containerHeight = this.options.container.clientHeight;
    const margin = this.options.margin;
    // Match the logic in epub-styler.ts
    const isTwoColumn = containerWidth > containerHeight;
    const gap = isTwoColumn && margin === 0 ? 8 : margin;

    const columnWidth = isTwoColumn
      ? Math.floor((containerWidth - margin * 2 - gap) / 2)
      : containerWidth - margin * 2;
    const singleColumnStride = columnWidth + gap;
    const columnsPerScreen = isTwoColumn ? 2 : 1;
    // The visual shift for one "page" turn
    const pageStride = singleColumnStride * columnsPerScreen;

    return {
      columnWidth,
      gap,
      singleColumnStride,
      columnsPerScreen,
      pageStride,
      containerWidth,
      margin,
    };
  }

  async displayCFI(cfi: CFI, internal: boolean = false, suppressPaint: boolean = false): Promise<void> {
    if (!internal && this.isBusy) return;
    if (!internal) this.isBusy = true;

    const prevVisibility = this.options.container.style.visibility;
    if (suppressPaint) {
      this.options.container.style.visibility = "hidden";
    }

    try {
      const parsed = CFIHelper.parse(cfi);
      if (!parsed) {
        await this.displaySpineIndex(0, true);
        return;
      }

      // Display the correct chapter (spine index) but silently
      await this.displaySpineIndex(parsed.spineIndex, true, true, "async");

      // Find element by path and scroll to it
      if (parsed.path && this.contentElement) {
        await this.waitForLayout("async");

        const element = CFIHelper.getElementByPath(this.contentElement, parsed.path);
        if (element instanceof HTMLElement) {
          const { pageStride, margin } = this.getLayoutInfo();

          const dpr = (globalThis as unknown as { devicePixelRatio?: number }).devicePixelRatio ?? 1;
          const fuzzPx = Math.max(2, Math.min(10, dpr * 2));

          // Robust absolute offset for multi-column nested elements
          let elementLeft: number | undefined;
          if (parsed.offset > 0) {
            const rect = CFIHelper.getTargetCharClientRect(element, parsed.offset);
            if (rect) {
              const contentRect = this.contentElement.getBoundingClientRect();
              elementLeft = rect.left - contentRect.left;
            }
          }

          if (elementLeft === undefined) {
            elementLeft = this.locationTracker.getVirtualOffsetLeft(element, this.contentElement);
          }

          // elementLeft is relative to contentElement origin (left padding edge).
          // We want to find which "screen" this element falls into.
          let pageIndex = Math.floor((elementLeft - margin + fuzzPx) / pageStride);
          pageIndex = Math.max(0, Math.min(pageIndex, this.totalPages - 1));

          // Verification: check if the target X actually falls in the chosen page's column(s)
          const screenStart = pageIndex * pageStride + margin;
          // The screen covers 'pageStride' width, but the content ends at 'columnWidth' before the gap of the next page?
          // Actually, visually the screen covers 'pageStride' (minus one gap at the end? no).
          // If 2 columns: [Col1][gap][Col2][gap]...
          // Screen 0: [Col1][gap][Col2]
          // Screen width = Col1 + gap + Col2 = 2*Col + gap.
          // pageStride = 2*Col + 2*gap.
          // So there is a gap between Screen 0 and Screen 1.
          const screenEnd = screenStart + pageStride; // Approximation

          if (elementLeft < screenStart - fuzzPx) {
            pageIndex -= 1;
          } else if (elementLeft > screenEnd + fuzzPx) {
            pageIndex += 1;
          }
          pageIndex = Math.max(0, Math.min(pageIndex, this.totalPages - 1));

          this.goToPage(pageIndex, true);
        } else {
          console.warn("[Renderer] CFI path not found in document:", parsed.path);
        }
      }
    } finally {
      if (suppressPaint) {
        this.options.container.style.visibility = prevVisibility;
      }
      if (!internal) {
        this.isBusy = false;
        this.notifyRelocated(false);
      }
    }
  }

  async displaySpineIndex(
    index: number,
    internal: boolean = false,
    skipInitialPage: boolean = false,
    layoutMode: "async" | "sync" = "async",
    suppressPaint: boolean = false,
  ): Promise<void> {
    if (!internal && this.isBusy) return;
    if (!internal) this.isBusy = true;

    const prevVisibility = this.options.container.style.visibility;
    if (suppressPaint) {
      this.options.container.style.visibility = "hidden";
    }

    try {
      if (index < 0 || index >= this.package.spine.length) {
        console.error("[Renderer] Invalid spine index:", index);
        return;
      }

      // If we are re-rendering the *same* chapter (e.g. resize / style update),
      // preserve the current transform so the user doesn't see a snap back to page 1.
      const preserveTransform = Boolean(this.contentElement) && index === this.currentSpineIndex;

      this.currentSpineIndex = index;
      const spineItem = this.package.spine[index];
      const manifestItem = this.package.manifest.get(spineItem.idref);

      if (!manifestItem) {
        console.error("[Renderer] Manifest item not found:", spineItem.idref);
        return;
      }

      const htmlContent = await this.parser.getFileAsText(this.parser.resolvePath(manifestItem.href));

      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, "text/html");

      await this.resourceResolver.resolveImages(doc, manifestItem.href);
      this.resourceResolver.resolveLinks(doc);
      const styles = await this.epubStyler.resolveCombinedStyles(doc, manifestItem.href);

      // Extract body attributes
      const attributes: Record<string, string> = {};
      const body = doc.body;
      if (body) {
        Array.from(body.attributes).forEach((attr) => {
          attributes[attr.name] = attr.value;
        });
      }

      const processedHtml = styles + doc.body.innerHTML;

      this.renderHtml(processedHtml, attributes, preserveTransform);

      await this.waitForLayout(layoutMode);
      this.calculatePages();
      if (!skipInitialPage) {
        this.goToPage(0, true);
      }
    } finally {
      if (suppressPaint) {
        this.options.container.style.visibility = prevVisibility;
      }
      if (!internal) {
        this.isBusy = false;
        this.notifyRelocated(false);
      }
    }
  }

  private async waitResourcesReady(): Promise<void> {
    if (!this.contentElement) return;

    const promises: Promise<unknown>[] = [];

    // 1. Fonts
    try {
      promises.push((document as unknown as { fonts: { ready: Promise<void> } }).fonts.ready);
    } catch (e) {
      console.warn("[Renderer] Font loading timeout or error", e);
    }

    // 2. Images in content
    const images = Array.from(this.contentElement.querySelectorAll("img"));
    images.forEach((img) => {
      if (!img.complete) {
        promises.push(
          new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          }),
        );
      }
      // Even if complete, decoding might still be happening if not awaited earlier
      if ("decode" in img) {
        promises.push(img.decode().catch(() => {}));
      }
    });

    await Promise.all(promises);
  }

  private async waitForLayout(mode: "async" | "sync" = "async"): Promise<void> {
    if (!this.contentElement) return;

    if (mode === "async") {
      await this.waitResourcesReady();
    }

    // Force reflow
    void this.contentElement.offsetWidth;
  }

  private renderHtml(html: string, attributes?: Record<string, string>, preserveTransform: boolean = false) {
    if (!this.shadowHost) {
      this.shadowHost = document.createElement("div");
      this.shadowHost.className = "epub-shadow-host";
      this.shadowHost.style.cssText = "width: 100%; height: 100%;";
      this.options.container.appendChild(this.shadowHost);
      this.shadowRoot = this.shadowHost.attachShadow({ mode: "open" });
    }

    if (!this.contentElement) {
      this.contentElement = document.createElement("div");
      this.contentElement.className = "epub-content";
      this.shadowRoot!.appendChild(this.contentElement);
    }

    this.contentElement.className = "epub-content";
    if (attributes) {
      Object.keys(attributes).forEach((key) => {
        if (key === "class") {
          this.contentElement!.classList.add(...(attributes[key] || "").split(" "));
        } else {
          this.contentElement!.setAttribute(key, attributes[key] || "");
        }
      });
    }

    this.contentElement.innerHTML = html;
    this.epubStyler.applyStyles(this.contentElement, this.shadowRoot, this.options, preserveTransform);
    this.epubStyler.snapMarginsToGrid(this.contentElement, this.options.fontSize);
  }

  async handleResize() {
    if (this.isBusy || !this.contentElement) return;
    this.isBusy = true;

    try {
      // Use the last known CFI if available, as calculating it during resize
      // (where container dimensions have changed but content layout hasn't)
      // is error-prone.
      let cfi = this.lastKnownCfi;

      if (!cfi) {
        // Fallback if we don't have a stored CFI (e.g. rarely happens if just initialized)
        // We attempt to calculate it, but we might be in a mixed state.
        const currentLocation = this.getCurrentLocation();
        cfi = currentLocation?.start?.cfi;
      }

      // Preserve the current transform while restyling to avoid flashing page 1.
      this.epubStyler.applyStyles(this.contentElement, this.shadowRoot, this.options, true);
      this.epubStyler.snapMarginsToGrid(this.contentElement, this.options.fontSize);
      await this.waitForLayout();
      this.calculatePages();

      if (cfi) {
        await this.displayCFI(cfi, true);
      } else {
        this.goToPage(this.currentPage, true);
      }
    } finally {
      this.isBusy = false;
      this.notifyRelocated(false);
    }
  }

  private calculatePages() {
    if (!this.contentElement) return;

    const { pageStride, margin } = this.getLayoutInfo();
    const scrollWidth = this.contentElement.scrollWidth;
    // We want the number of screens.
    // scrollWidth approx total pages * stride
    this.totalPages = Math.max(1, Math.round((scrollWidth - margin) / pageStride));
  }

  private goToPage(pageIndex: number, internal: boolean = false) {
    if (!this.contentElement) return;

    this.currentPage = Math.max(0, Math.min(pageIndex, this.totalPages - 1));
    const { pageStride } = this.getLayoutInfo();
    this.contentElement.style.transform = `translateX(-${this.currentPage * pageStride}px)`;
    if (!internal) {
      this.notifyRelocated(true);
    }
  }

  async next(): Promise<boolean> {
    if (this.isBusy) return false;
    if (this.currentPage < this.totalPages - 1) {
      this.goToPage(this.currentPage + 1);
      return true;
    } else if (this.currentSpineIndex < this.package.spine.length - 1) {
      await this.displaySpineIndex(this.currentSpineIndex + 1, false, false, "async", true);
      return true;
    }
    return false;
  }

  async prev(): Promise<boolean> {
    if (this.isBusy) return false;
    if (this.currentPage > 0) {
      this.goToPage(this.currentPage - 1);
      return true;
    } else if (this.currentSpineIndex > 0) {
      this.isBusy = true;
      const prevVisibility = this.options.container.style.visibility;
      this.options.container.style.visibility = "hidden";
      try {
        // Use skipInitialPage to avoid flashing page 0
        await this.displaySpineIndex(this.currentSpineIndex - 1, true, true, "async");
        this.goToPage(this.totalPages - 1, true);
        return true;
      } finally {
        this.options.container.style.visibility = prevVisibility;
        this.isBusy = false;
        this.notifyRelocated(false);
      }
    }
    return false;
  }

  getCurrentLocation(basicOnly: boolean = false): EpubLocation {
    const { containerWidth } = this.getLayoutInfo();
    const loc = this.locationTracker.getCurrentLocation(
      this.contentElement,
      this.currentPage,
      this.totalPages,
      this.currentSpineIndex,
      this.options,
      basicOnly,
      containerWidth,
    )!;

    if (loc?.start?.cfi) {
      this.lastKnownCfi = loc.start.cfi;
    }

    return loc;
  }

  private notifyRelocated(basic: boolean = false) {
    if (this.isBusy) return;
    if (this.onRelocated) {
      const loc = this.getCurrentLocation(basic);
      if (loc?.start?.cfi) {
        this.lastKnownCfi = loc.start.cfi;
      }
      this.onRelocated(loc);
    }
  }

  updateSettings(options: Partial<RendererOptions>) {
    if (this.isBusy) return;
    this.options = { ...this.options, ...options };
    this.handleResize();
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.resourceResolver.destroy();

    if (this.contentElement) {
      this.contentElement.remove();
      this.contentElement = null;
    }
    if (this.shadowHost) {
      this.shadowHost.remove();
      this.shadowHost = null;
    }
  }
}
