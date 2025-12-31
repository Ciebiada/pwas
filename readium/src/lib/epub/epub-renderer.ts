import type { EpubParser } from "./epub-parser";
import type { EpubPackage } from "./epub-types";
import { CFIHelper, type CFI } from "./epub-cfi";

type RendererOptions = {
  container: HTMLElement;
  fontSize: number;
  fontFamily: string;
  margin: number;
  theme: "light" | "dark";
};

export class EpubRenderer {
  private parser: EpubParser;
  private package: EpubPackage;
  private options: RendererOptions;
  private currentSpineIndex: number = 0;
  private currentPage: number = 0;
  private totalPages: number = 0;
  private contentElement: HTMLElement | null = null;
  private resourceCache: Map<string, string> = new Map();
  private isBusy: boolean = false;
  private resizeObserver: ResizeObserver;

  private onRelocated?: (location: any) => void;
  private totalBookSize: number = 0;
  private cumulativeSizes: number[] = [];

  constructor(
    parser: EpubParser,
    packageData: EpubPackage,
    options: RendererOptions,
  ) {
    this.parser = parser;
    this.package = packageData;
    this.options = options;

    // Calculate size weights for progress
    let currentTotal = 0;
    this.cumulativeSizes = this.package.spine.map((item) => {
      const start = currentTotal;
      currentTotal += item.size || 0;
      return start;
    });
    this.totalBookSize = currentTotal;

    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(this.options.container);
  }

  setOnRelocated(callback: (location: any) => void) {
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

  async displayCFI(
    cfi: CFI,
    internal: boolean = false,
    suppressPaint: boolean = false,
  ): Promise<void> {
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
      // For restores we prefer a fully-settled layout (fonts + multi-column) to avoid
      // Safari occasionally restoring to the previous page due to late layout shifts.
      // We hide during this work if `suppressPaint` is true.
      await this.displaySpineIndex(parsed.spineIndex, true, true, "async");

      // Find element by path and scroll to it
      if (parsed.path && this.contentElement) {
        await this.waitForLayout("async");

        const element = CFIHelper.getElementByPath(
          this.contentElement,
          parsed.path,
        );
        if (element instanceof HTMLElement) {
          const containerWidth = this.options.container.clientWidth;
          const margin = this.options.margin;
          const columnWidth = containerWidth - margin * 2;
          const stride = columnWidth + margin;

          const dpr = (globalThis as any).devicePixelRatio ?? 1;
          const fuzzPx = Math.max(2, Math.min(10, dpr * 2));

          const locateTextPosition = (
            root: HTMLElement,
            absoluteOffset: number,
          ): { node: Text; offset: number } | null => {
            try {
              const walker = document.createTreeWalker(
                root,
                NodeFilter.SHOW_TEXT,
              );
              let currentOffset = 0;
              let n: Node | null;
              while ((n = walker.nextNode())) {
                const text = n as Text;
                const len = text.length ?? (text.textContent?.length || 0);
                if (currentOffset + len >= absoluteOffset) {
                  return {
                    node: text,
                    offset: Math.max(0, absoluteOffset - currentOffset),
                  };
                }
                currentOffset += len;
              }
            } catch {
              // ignore
            }
            return null;
          };

          const getTargetCharClientRect = (): DOMRect | null => {
            if (!this.contentElement) return null;

            // Important for iOS Safari:
            // If the offset lands on collapsed whitespace / zero-width glyphs, Range rects
            // can be empty. Falling back to element bounding boxes can anchor in the *previous*
            // column, which then restores one page back. So we scan forward a bit to find the
            // first character that yields a real rect.
            const startOffset = Math.max(0, parsed.offset || 0);
            const maxLookahead = 64;

            const startPos = locateTextPosition(element, startOffset);
            if (!startPos) return element.getBoundingClientRect();

            try {
              const range = document.createRange();

              let node: Text | null = startPos.node;
              let localOffset = startPos.offset;
              let remaining = maxLookahead;

              while (node && remaining >= 0) {
                const nodeLen = node.length ?? (node.textContent?.length || 0);
                while (localOffset < nodeLen && remaining >= 0) {
                  // Try a 1-character range; if it yields no rects, advance.
                  const end = Math.min(nodeLen, localOffset + 1);
                  range.setStart(node, localOffset);
                  range.setEnd(node, end);
                  const rects = range.getClientRects();
                  if (rects && rects.length > 0) {
                    return rects[0] as DOMRect;
                  }
                  localOffset += 1;
                  remaining -= 1;
                }

                // Move to next text node
                const walker = document.createTreeWalker(
                  element,
                  NodeFilter.SHOW_TEXT,
                );
                // Advance walker to current node, then move to next.
                let cur: Node | null;
                let found = false;
                while ((cur = walker.nextNode())) {
                  if (cur === node) {
                    found = true;
                    break;
                  }
                }
                node = found ? (walker.nextNode() as Text | null) : null;
                localOffset = 0;
              }

              // As a last resort, use the element’s first client rect (more stable than bounding box)
              const elRects = element.getClientRects();
              if (elRects && elRects.length > 0) return elRects[0] as DOMRect;
              return element.getBoundingClientRect();
            } catch {
              return element.getBoundingClientRect();
            }
          };

          // Robust absolute offset for multi-column nested elements
          let elementLeft: number | undefined;
          if (parsed.offset > 0) {
            const rect = getTargetCharClientRect();
            if (rect) {
              const contentRect = this.contentElement.getBoundingClientRect();
              elementLeft = rect.left - contentRect.left;
            }
          }

          if (elementLeft === undefined) {
            elementLeft = this.getVirtualOffsetLeft(element);
          }

          // elementLeft is relative to contentElement origin (left padding edge).
          // Subpixel undershoot on Safari can cause elementLeft to be slightly less than
          // the expected column start. Adding fuzzPx makes the floor robust.
          let pageIndex = Math.floor((elementLeft - margin + fuzzPx) / stride);
          pageIndex = Math.max(0, Math.min(pageIndex, this.totalPages - 1));

          // Verification: check if the target X actually falls in the chosen page's column
          const colStart = pageIndex * stride + margin;
          const colEnd = colStart + columnWidth;

          if (elementLeft < colStart - fuzzPx) {
            pageIndex -= 1;
          } else if (elementLeft > colEnd + fuzzPx) {
            pageIndex += 1;
          }
          pageIndex = Math.max(0, Math.min(pageIndex, this.totalPages - 1));

          this.goToPage(pageIndex, true);
        } else {
          console.warn(
            "[Renderer] CFI path not found in document:",
            parsed.path,
          );
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
      const preserveTransform =
        Boolean(this.contentElement) && index === this.currentSpineIndex;

      this.currentSpineIndex = index;
      const spineItem = this.package.spine[index];
      const manifestItem = this.package.manifest.get(spineItem.idref);

      if (!manifestItem) {
        console.error("[Renderer] Manifest item not found:", spineItem.idref);
        return;
      }

      const htmlContent = await this.parser.getFileAsText(
        this.parser.resolvePath(manifestItem.href),
      );
      const { html, attributes } = await this.processHtml(
        htmlContent,
        manifestItem.href,
      );

      this.renderHtml(html, attributes, preserveTransform);

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

    const promises: Promise<any>[] = [];

    // 1. Fonts
    try {
      promises.push((document as any).fonts.ready);
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
        promises.push(img.decode().catch(() => { }));
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

  private async processHtml(
    html: string,
    baseHref: string,
  ): Promise<{ html: string; attributes: any }> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    await this.resolveImages(doc, baseHref);
    this.resolveLinks(doc);
    const styles = await this.resolveCombinedStyles(doc, baseHref);

    // Extract body attributes
    const attributes: any = {};
    const body = doc.body;
    if (body) {
      Array.from(body.attributes).forEach((attr) => {
        attributes[attr.name] = attr.value;
      });
    }

    return {
      html: styles + doc.body.innerHTML,
      attributes,
    };
  }

  private async resolveCombinedStyles(
    doc: Document,
    baseHref: string,
  ): Promise<string> {
    const UA_STYLES = `
            p { text-indent: 1.5em; }
            p.first, p.no-indent { text-indent: 0; }
            h1 { font-size: 1.5em; font-weight: bold; }
            h2 { font-size: 1.4em; font-weight: bold; }
            h3 { font-size: 1.3em; font-weight: bold; }
            h4, h5, h6 { font-size: 1.1em; font-weight: bold; }
            figure { margin: 0; padding: 0; }
        `;

    let combinedCss = `/* UA Styles */\n${UA_STYLES}\n`;

    const styleTags = Array.from(doc.querySelectorAll("style"));
    for (const tag of styleTags) {
      combinedCss +=
        (await this.resolveUrlsInCss(tag.textContent || "", baseHref)) + "\n";
    }

    const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
    for (const link of links) {
      const href = link.getAttribute("href");
      if (href) {
        const resolvedPath = this.resolveRelativePath(href, baseHref);
        try {
          const css = await this.parser.getFileAsText(
            this.parser.resolvePath(resolvedPath),
          );
          const resolvedCss = await this.resolveUrlsInCss(css, resolvedPath);
          combinedCss += `\n/* ${href} */\n${resolvedCss}\n`;
        } catch (e) {
          console.warn(
            `[Renderer] Failed to load stylesheet: ${resolvedPath}`,
            e,
          );
        }
      }
    }

    const rewrittenCss = combinedCss.replace(
      /(^|[}\s,])body(?=[\s.#[:{,])/gi,
      "$1.epub-content",
    );
    return `<style>${rewrittenCss}</style>`;
  }

  private async resolveUrlsInCss(
    css: string,
    baseHref: string,
  ): Promise<string> {
    const urlRegex = /url\(['"]?([^'")]*)['"]?\)/g;
    const matches = Array.from(css.matchAll(urlRegex));
    let resolvedCss = css;

    for (const match of matches) {
      const originalUrl = match[1];
      if (
        !originalUrl ||
        originalUrl.startsWith("data:") ||
        originalUrl.startsWith("http")
      )
        continue;

      const resolvedPath = this.resolveRelativePath(originalUrl, baseHref);
      const cachedUrl = this.resourceCache.get(resolvedPath);

      if (cachedUrl) {
        resolvedCss = resolvedCss.replace(match[0], `url("${cachedUrl}")`);
      } else {
        try {
          const blob = await this.parser.getFile(resolvedPath);
          if (blob) {
            const url = URL.createObjectURL(blob);
            this.resourceCache.set(resolvedPath, url);
            resolvedCss = resolvedCss.replace(match[0], `url("${url}")`);
          }
        } catch (e) {
          console.warn(
            `[Renderer] Failed to resolve CSS URL: ${resolvedPath}`,
            e,
          );
        }
      }
    }
    return resolvedCss;
  }

  private async resolveImages(doc: Document, baseHref: string) {
    const images = Array.from(doc.querySelectorAll("img"));
    const svgImages = Array.from(doc.querySelectorAll("image"));
    const allImages = [...images, ...svgImages];

    for (const img of allImages) {
      const src =
        img.getAttribute("src") ||
        img.getAttribute("xlink:href") ||
        img.getAttribute("href");
      if (!src) continue;

      const resolvedPath = this.resolveRelativePath(src, baseHref);
      const cachedUrl = this.resourceCache.get(resolvedPath);

      if (cachedUrl) {
        this.setImageSource(img, cachedUrl);
      } else {
        try {
          const blob = await this.parser.getFile(resolvedPath);
          if (blob) {
            const url = URL.createObjectURL(blob);
            this.resourceCache.set(resolvedPath, url);

            const tempImg = new Image();
            tempImg.src = url;
            try {
              await tempImg.decode();
              img.setAttribute("width", tempImg.naturalWidth.toString());
              img.setAttribute("height", tempImg.naturalHeight.toString());
            } catch (decodeErr) {
              console.warn(
                `[Renderer] Failed to decode image matching: ${resolvedPath}`,
                decodeErr,
              );
            }

            this.setImageSource(img, url);
          }
        } catch (e) {
          console.warn(`[Renderer] Failed to load image: ${resolvedPath}`, e);
        }
      }
    }
  }

  private setImageSource(element: Element, url: string) {
    if (element.tagName.toLowerCase() === "image") {
      element.setAttribute("xlink:href", url);
      element.setAttribute("href", url);
    } else {
      element.setAttribute("src", url);
    }
  }

  private resolveLinks(doc: Document) {
    const links = doc.querySelectorAll("a[href]");
    links.forEach((link) => {
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      link.setAttribute("data-internal-link", href);
      link.setAttribute("href", "#");
    });
  }

  private resolveRelativePath(path: string, baseHref: string): string {
    if (path.startsWith("http") || path.startsWith("/")) {
      return path;
    }
    const basePath = baseHref.substring(0, baseHref.lastIndexOf("/") + 1);
    const combined = basePath + path;
    return this.normalizePath(combined);
  }

  private normalizePath(path: string): string {
    const parts = path.split("/");
    const stack: string[] = [];
    for (const part of parts) {
      if (part === "." || part === "") continue;
      if (part === "..") {
        if (stack.length > 0) stack.pop();
      } else {
        stack.push(part);
      }
    }
    return stack.join("/");
  }

  private renderHtml(
    html: string,
    attributes?: any,
    preserveTransform: boolean = false,
  ) {
    if (!this.contentElement) {
      this.contentElement = document.createElement("div");
      this.contentElement.className = "epub-content";
      this.options.container.appendChild(this.contentElement);
    }

    this.contentElement.className = "epub-content";
    if (attributes) {
      Object.keys(attributes).forEach((key) => {
        if (key === "class") {
          this.contentElement!.classList.add(...attributes[key].split(" "));
        } else {
          this.contentElement!.setAttribute(key, attributes[key]);
        }
      });
    }

    this.contentElement.innerHTML = html;
    this.applyStyles(preserveTransform);
    this.snapMarginsToGrid();
  }

  private applyStyles(preserveTransform: boolean = false) {
    if (!this.contentElement) return;

    // `style.cssText = ...` clears all inline styles, including `transform`.
    // During resize / re-style of the same spine item, that creates a visible snap
    // back to the chapter start before we restore the saved CFI. Preserve transform.
    const previousTransform = preserveTransform
      ? this.contentElement.style.transform
      : "";

    const { fontSize, fontFamily, margin, theme } = this.options;
    const colors = {
      light: { color: "#000000", background: "#ffffff" },
      dark: { color: "#dedede", background: "#000000" },
    };

    const themeColors = colors[theme];
    const containerWidth = this.options.container.clientWidth;
    const columnWidth = containerWidth - margin * 2;

    this.contentElement.style.cssText = `
            box-sizing: border-box;
            font-size: ${fontSize}%;
            font-family: ${fontFamily};
            color: ${themeColors.color};
            background: ${themeColors.background};
            padding: 0 ${margin}px;
            width: 100%;
            column-width: ${columnWidth}px;
            column-gap: ${margin}px;
            column-fill: auto;
            height: 100%;
            overflow: visible;
            position: relative;
            margin: 0;
            will-change: transform;
        `;
    if (previousTransform) {
      this.contentElement.style.transform = previousTransform;
    }

    const styleId = "epub-image-styles";
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    const lineHeight = Math.round(fontSize * 0.16 * 1.6);

    styleEl.innerHTML = `
            .epub-content * {
                font-family: ${fontFamily} !important;
                color: ${themeColors.color} !important;
                line-height: 1 !important;
            }
            /* Restore grid rhythm for block containers */
            .epub-content p,
            .epub-content h1,
            .epub-content h2,
            .epub-content h3,
            .epub-content h4,
            .epub-content h5,
            .epub-content h6,
            .epub-content div,
            .epub-content li,
            .epub-content blockquote,
            .epub-content pre,
            .epub-content dt,
            .epub-content dd,
            .epub-content th,
            .epub-content td {
                line-height: ${lineHeight}px !important;
            }
            .epub-content img {
                display: block !important;
                margin: 0 auto !important;
                max-width: 100% !important;
                max-height: ${this.options.container.clientHeight}px !important;
                break-inside: avoid;
                box-sizing: border-box;
                object-fit: contain;
            }
            .epub-content svg {
                display: block !important;
                margin: 0 auto !important;
                max-width: 100% !important;
                max-height: ${this.options.container.clientHeight}px !important;
                break-inside: avoid;
            }
        `;
  }

  async handleResize() {
    if (this.isBusy || !this.contentElement) return;
    this.isBusy = true;

    try {
      const currentLocation = this.getCurrentLocation();
      const cfi = currentLocation?.start?.cfi;

      // Preserve the current transform while restyling to avoid flashing page 1.
      this.applyStyles(true);
      this.snapMarginsToGrid();
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

  private snapMarginsToGrid() {
    if (!this.contentElement) return;

    const fontSize = this.options.fontSize;
    const gridUnit = Math.round(fontSize * 0.16 * 1.6);
    const elements = this.contentElement.querySelectorAll(
      "h1, h2, h3, h4, h5, h6, p, blockquote, div, section, article, ul, ol, li, pre, figure, dt, dd",
    );

    elements.forEach((el) => {
      const element = el as HTMLElement;
      const computed = getComputedStyle(element);
      const marginTop = parseFloat(computed.marginTop);
      const marginBottom = parseFloat(computed.marginBottom);

      if (marginTop > 0) {
        const snapped = Math.round(marginTop / gridUnit) * gridUnit;
        element.style.marginTop = `${snapped}px`;
      }
      if (marginBottom > 0) {
        const snapped = Math.round(marginBottom / gridUnit) * gridUnit;
        element.style.marginBottom = `${snapped}px`;
      }
    });
  }

  private calculatePages() {
    if (!this.contentElement) return;

    const containerWidth = this.options.container.clientWidth;
    const margin = this.options.margin;
    const columnWidth = containerWidth - margin * 2;
    const stride = columnWidth + margin;

    const scrollWidth = this.contentElement.scrollWidth;
    this.totalPages = Math.max(1, Math.round((scrollWidth - margin) / stride));
  }

  private goToPage(pageIndex: number, internal: boolean = false) {
    if (!this.contentElement) return;

    this.currentPage = Math.max(0, Math.min(pageIndex, this.totalPages - 1));
    const containerWidth = this.options.container.clientWidth;
    const margin = this.options.margin;
    const stride = containerWidth - margin * 2 + margin;

    this.contentElement.style.transform = `translateX(-${this.currentPage * stride}px)`;
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
      await this.displaySpineIndex(
        this.currentSpineIndex + 1,
        false,
        false,
        "async",
        true,
      );
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
        await this.displaySpineIndex(
          this.currentSpineIndex - 1,
          true,
          true,
          "async",
        );
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

  getCurrentLocation(basicOnly: boolean = false): any {
    const currentSpineItem = this.package.spine[this.currentSpineIndex];
    const chapterBaseSize = this.cumulativeSizes[this.currentSpineIndex];
    const chapterPercentage =
      this.totalPages > 0 ? this.currentPage / this.totalPages : 0;
    const globalProgress =
      this.totalBookSize > 0
        ? ((chapterBaseSize +
          chapterPercentage * (currentSpineItem.size || 0)) /
          this.totalBookSize) *
        100
        : 0;

    const displayed = {
      page: this.currentPage + 1,
      total: this.totalPages,
      spineIndex: this.currentSpineIndex,
      spineTotal: this.package.spine.length,
      percentage: globalProgress,
    };

    if (basicOnly) {
      return { basic: true, start: { displayed } };
    }

    const element = this.getFirstVisibleElement();
    if (!element || !this.contentElement) return { start: { displayed } };

    const contentRect = this.contentElement.getBoundingClientRect();
    const margin = this.options.margin;
    const containerWidth = this.options.container.clientWidth;
    const stride = containerWidth - margin * 2 + margin;

    const dpr = (globalThis as any).devicePixelRatio ?? 1;
    const fuzzPx = Math.max(2, Math.min(10, dpr * 2));
    const visibleMin = this.currentPage * stride + margin;

    // Calculate offset if element starts off-screen (to the left of current visible column)
    let offset = 0;
    const rects = element.getClientRects();
    const rect =
      rects && rects.length > 0 ? rects[0] : element.getBoundingClientRect();
    const elementLeftInContent = rect.left - contentRect.left;

    if (elementLeftInContent < visibleMin - fuzzPx) {
      offset = this.findFirstVisibleCharOffset(element);
    }

    const cfi = CFIHelper.generate(
      this.currentSpineIndex,
      element,
      this.contentElement,
      offset,
    );

    return {
      start: {
        cfi,
        displayed,
      },
    };
  }

  private findFirstVisibleCharOffset(element: Element): number {
    if (!this.contentElement) return 0;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const contentRect = this.contentElement.getBoundingClientRect();
    const margin = this.options.margin;
    const containerWidth = this.options.container.clientWidth;
    const columnWidth = containerWidth - margin * 2;
    const stride = columnWidth + margin;

    // The current visible range in content coordinates
    const visibleMin = this.currentPage * stride + margin;
    const visibleMax = visibleMin + columnWidth;

    const dpr = (globalThis as any).devicePixelRatio ?? 1;
    const fuzzPx = Math.max(2, Math.min(10, dpr * 2));

    let node;
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

  private getFirstVisibleElement(): Element | null {
    if (!this.contentElement) return null;

    const containerRect = this.options.container.getBoundingClientRect();
    const margin = this.options.margin;

    // Probe point: bit into the first column
    const probeX = containerRect.left + margin + 10;
    const probeY = containerRect.top + margin + 10;

    // Use elementsFromPoint to see through overlays (like nav-zone)
    const targets = document.elementsFromPoint(probeX, probeY);

    // Find the first element that is a descendant of contentElement
    // but not a generic structural container.
    const element = targets.find(
      (t) =>
        this.contentElement?.contains(t) &&
        t !== this.contentElement &&
        !["div", "section", "article", "body"].includes(
          t.tagName.toLowerCase(),
        ),
    );

    if (element) return element;

    // Fallback: iterate through children to find the first visible one
    const candidates = this.contentElement.querySelectorAll(
      "p, h1, h2, h3, h4, h5, h6, img, li",
    );
    for (const cand of Array.from(candidates)) {
      const rect = cand.getBoundingClientRect();
      // Element is visible if its left edge is within the visible column
      if (
        rect.left >= containerRect.left - 5 &&
        rect.left < containerRect.right - margin
      ) {
        return cand;
      }
    }

    return this.contentElement;
  }

  private getVirtualOffsetLeft(element: Element): number {
    if (!this.contentElement) return 0;
    // Use getClientRects()[0] instead of getBoundingClientRect() for multi-column layouts.
    // getBoundingClientRect() returns a rect spanning all columns the element appears in,
    // but getClientRects() returns individual rects per column fragment.
    const rects = element.getClientRects();
    const rect =
      rects && rects.length > 0 ? rects[0] : element.getBoundingClientRect();
    const contentRect = this.contentElement.getBoundingClientRect();
    return rect.left - contentRect.left;
  }

  private notifyRelocated(basic: boolean = false) {
    if (this.isBusy) return;
    if (this.onRelocated) {
      this.onRelocated(this.getCurrentLocation(basic));
    }
  }

  updateSettings(options: Partial<RendererOptions>) {
    if (this.isBusy) return;
    this.options = { ...this.options, ...options };
    this.handleResize();
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.resourceCache.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    this.resourceCache.clear();

    if (this.contentElement) {
      this.contentElement.remove();
      this.contentElement = null;
    }
  }
}
