import { isIOS } from "ui/platform";
import { computeLayoutInfo } from "./epub-layout";
import type { EpubParser } from "./epub-parser";
import type { RendererOptions } from "./epub-types";
import type { ResourceResolver } from "./resource-resolver";

const UA_STYLES = `
            p { text-indent: 1.5em; }
            p.first, p.no-indent { text-indent: 0; }
            h1 { font-size: 1.5em; font-weight: bold; }
            h2 { font-size: 1.4em; font-weight: bold; }
            h3 { font-size: 1.3em; font-weight: bold; }
            h4, h5, h6 { font-size: 1.1em; font-weight: bold; }
            
            /* Fix for books where paragraphs are incorrectly wrapped in headings */
            h1 p, h2 p, h3 p, h4 p, h5 p, h6 p {
                font-size: calc(1rem * var(--user-font-scale));
                font-weight: normal;
                line-height: 1.6; /* Ensure readable line height for body text */
                text-transform: none;
                letter-spacing: normal;
            }

            figure { margin: 0; padding: 0; }
        `;

export class EpubStyler {
  constructor(
    private parser: EpubParser,
    private resolver: ResourceResolver,
  ) {}

  async resolveCombinedStyles(doc: Document, baseHref: string): Promise<string> {
    let combinedCss = `/* UA Styles */\n${UA_STYLES}\n`;

    const styleTags = Array.from(doc.querySelectorAll("style"));
    for (const tag of styleTags) {
      combinedCss += `${await this.resolver.resolveUrlsInCss(tag.textContent || "", baseHref)}\n`;
    }

    const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
    for (const link of links) {
      const href = link.getAttribute("href");
      if (href) {
        const resolvedPath = this.resolver.resolveRelativePath(href, baseHref);
        try {
          const css = await this.parser.getFileAsText(this.parser.resolvePath(resolvedPath));
          const resolvedCss = await this.resolver.resolveUrlsInCss(css, resolvedPath);
          combinedCss += `\n/* ${href} */\n${resolvedCss}\n`;
        } catch (e) {
          console.warn(`[EpubStyler] Failed to load stylesheet: ${resolvedPath}`, e);
        }
      }
    }

    const rewrittenCss = combinedCss.replace(/(^|[}\s,])body(?=[\s.#[:{,])/gi, "$1.epub-content");
    return `<style>${rewrittenCss}</style>`;
  }

  applyStyles(
    contentElement: HTMLElement | null,
    shadowRoot: ShadowRoot | null,
    options: RendererOptions,
    preserveTransform: boolean = false,
  ) {
    if (!contentElement || !shadowRoot) return;

    const previousTransform = preserveTransform ? contentElement.style.transform : "";

    const { fontSize, fontFamily, margin, container } = options;
    const userScale = fontSize / 100;
    const backgroundColor = options.theme === "dark" ? "#000000" : "#ffffff";
    const textColor = options.theme === "dark" ? "#dedede" : "#000000";
    const pageFillHeight = this.getPageFillHeight(options);

    const { columnWidth, gap } = computeLayoutInfo(options);

    if (isIOS) {
      contentElement.dataset.iosFirstColumnFix = "1";
    } else {
      delete contentElement.dataset.iosFirstColumnFix;
    }

    contentElement.style.cssText = `
            --reader-background-color: ${backgroundColor};
            --reader-text-color: ${textColor};
            --user-font-scale: ${userScale};
            --reader-page-fill-height: ${pageFillHeight}px;
            box-sizing: border-box;
            font-size: ${fontSize}%;
            font-family: ${fontFamily};
            background: var(--reader-background-color);
            color: var(--reader-text-color);
            padding: 0 ${margin}px;
            width: 100%;
            column-width: ${columnWidth}px;
            column-count: auto;
            column-gap: ${gap}px;
            column-fill: auto;
            height: 100%;
            overflow: visible;
            position: relative;
            margin: 0;
            will-change: transform;
            widows: 1;
            orphans: 1;
            -webkit-text-size-adjust: none;
            text-size-adjust: none;
        `;
    if (previousTransform) {
      contentElement.style.transform = previousTransform;
    }

    const styleId = "epub-image-styles";
    let styleEl = shadowRoot.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      shadowRoot.insertBefore(styleEl, shadowRoot.firstChild);
    }
    const lineHeight = Math.round(fontSize * 0.16 * 1.6);

    styleEl.innerHTML = `
            :host {
                display: block;
                width: 100%;
                height: 100%;
                user-select: text;
                -webkit-user-select: text;
                -webkit-touch-callout: default;
            }
            .epub-content[data-ios-first-column-fix="1"]::before {
                content: "";
                display: block;
                height: 1px;
                width: 100%;
            }
            .epub-content * {
                font-family: ${fontFamily} !important;
                color: var(--reader-text-color) !important;
                line-height: 1 !important;
            }
            .epub-content {
                background: var(--reader-background-color) !important;
                color: var(--reader-text-color) !important;
                user-select: text;
                -webkit-user-select: text;
                -webkit-touch-callout: default;
            }
            .epub-content * {
                user-select: text;
                -webkit-user-select: text;
                -webkit-touch-callout: default;
            }
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
            .epub-content td,
            .epub-content span,
            .epub-content a,
            .epub-content br {
                line-height: ${lineHeight}px !important;
                vertical-align: top !important;
            }
            .epub-content h1,
            .epub-content h2,
            .epub-content h3,
            .epub-content h4,
            .epub-content h5,
            .epub-content h6 {
                background: var(--reader-background-color) !important;
                color: var(--reader-text-color) !important;
            }
            .epub-content hr {
                background: transparent !important;
                border: 0 !important;
                border-color: var(--reader-text-color) !important;
                color: var(--reader-text-color) !important;
                box-sizing: border-box !important;
                display: block !important;
                height: ${lineHeight}px !important;
                border-bottom: 2px solid var(--reader-text-color) !important;
            }
            .epub-content > .epub-opening-block {
                position: absolute;
                top: 0;
                box-sizing: border-box;
                z-index: 1;
            }
            .epub-content > .epub-leading-spine-sparse {
                display: block;
                box-sizing: border-box;
                height: var(--reader-page-fill-height);
                min-height: var(--reader-page-fill-height);
                max-height: var(--reader-page-fill-height);
                overflow: hidden;
                break-inside: avoid;
            }
            .epub-content > .epub-following-spine-opening {
                position: relative;
            }
            .epub-content > .epub-following-spine-opening > .epub-merged-opening-block {
                box-sizing: border-box;
                height: var(--reader-page-fill-height);
                min-height: var(--reader-page-fill-height);
                max-height: var(--reader-page-fill-height);
                overflow: hidden;
            }
            .epub-content > .epub-following-spine {
                display: block;
            }
            .epub-content td {
                line-height: ${lineHeight}px !important;
            }
            .epub-content img {
                display: block !important;
                margin: 0 auto !important;
                max-width: 100% !important;
                max-height: ${container.clientHeight}px !important;
                break-inside: avoid;
                box-sizing: border-box;
                object-fit: contain;
                ${options.invertImages ? "filter: invert(1) hue-rotate(180deg);" : ""}
            }
            .epub-content svg {
                display: block !important;
                margin: 0 auto !important;
                max-width: 100% !important;
                max-height: ${container.clientHeight}px !important;
                break-inside: avoid;
                ${options.invertImages ? "filter: invert(1) hue-rotate(180deg);" : ""}
            }
            .epub-content br {
                display: inline !important;
            }
        `;
  }

  async snapMarginsToGridCooperative(
    contentElement: HTMLElement | null,
    fontSize: number,
    options: RendererOptions | undefined,
    shouldYield: () => boolean,
    yieldToMain: () => Promise<void>,
  ) {
    if (!contentElement) return;

    const gridUnit = Math.round(fontSize * 0.16 * 1.6);
    const elements = Array.from(
      contentElement.querySelectorAll(
        "h1, h2, h3, h4, h5, h6, p, blockquote, div, section, article, ul, ol, li, pre, figure, dt, dd, hr",
      ),
    );

    for (const el of elements) {
      const element = el as HTMLElement;
      const computed = getComputedStyle(element);

      const marginTop = parseFloat(computed.marginTop);
      const marginBottom = parseFloat(computed.marginBottom);
      const paddingTop = parseFloat(computed.paddingTop);
      const paddingBottom = parseFloat(computed.paddingBottom);

      if (marginTop > 0) {
        const snapped = Math.round(marginTop / gridUnit) * gridUnit;
        element.style.setProperty("margin-top", `${snapped}px`, "important");
      }
      if (marginBottom > 0) {
        const snapped = Math.round(marginBottom / gridUnit) * gridUnit;
        element.style.setProperty("margin-bottom", `${snapped}px`, "important");
      }
      if (paddingTop > 0) {
        const snapped = Math.round(paddingTop / gridUnit) * gridUnit;
        element.style.setProperty("padding-top", `${snapped}px`, "important");
      }
      if (paddingBottom > 0) {
        const snapped = Math.round(paddingBottom / gridUnit) * gridUnit;
        element.style.setProperty("padding-bottom", `${snapped}px`, "important");
      }

      if (shouldYield()) {
        await yieldToMain();
      }
    }

    const images = Array.from(contentElement.querySelectorAll("img, svg"));
    for (const el of images) {
      const element = el as HTMLElement;
      const rect = element.getBoundingClientRect();
      if (rect.height > 0) {
        const snappedHeight = Math.round(rect.height / gridUnit) * gridUnit;
        element.style.height = `${snappedHeight}px`;
      }

      if (shouldYield()) {
        await yieldToMain();
      }
    }

    const textElements = Array.from(contentElement.querySelectorAll("h1, h2, h3, h4, h5, h6, p, div, span, a"));
    for (const el of textElements) {
      const element = el as HTMLElement;
      const computed = getComputedStyle(element);
      const fontSize = parseFloat(computed.fontSize);

      if (fontSize > gridUnit) {
        const multiple = Math.ceil(fontSize / gridUnit);
        const newLineHeight = multiple * gridUnit;
        element.style.setProperty("line-height", `${newLineHeight}px`, "important");
      }

      if (shouldYield()) {
        await yieldToMain();
      }
    }

    this.layoutOpeningBlock(contentElement, options, gridUnit);
  }

  private layoutOpeningBlock(contentElement: HTMLElement, options?: RendererOptions, gridUnit?: number) {
    contentElement.style.height = "100%";
    contentElement.style.removeProperty("padding-top");

    const previousFlowOffset = contentElement.querySelector<HTMLElement>(':scope > [data-opening-flow-offset="1"]');
    if (previousFlowOffset) {
      previousFlowOffset.style.marginTop = previousFlowOffset.dataset.openingBaseMargin ?? "";
      delete previousFlowOffset.dataset.openingFlowOffset;
      delete previousFlowOffset.dataset.openingBaseMargin;
    }

    if (!options) return;

    const { isTwoColumn, columnWidth, margin } = computeLayoutInfo(options);
    const existingWrapper = contentElement.querySelector<HTMLElement>(":scope > .epub-opening-block");
    this.layoutMergedOpening(contentElement, options, gridUnit);

    if (!isTwoColumn) {
      if (existingWrapper) {
        this.unwrapOpeningBlock(existingWrapper);
      }
      return;
    }

    const wrapper = existingWrapper ?? this.createOpeningBlock(contentElement);
    if (!wrapper) return;

    wrapper.style.left = `${margin}px`;
    wrapper.style.width = `${columnWidth}px`;

    const contentRect = contentElement.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const reservedHeight = Math.max(0, Math.ceil(wrapperRect.bottom - contentRect.top));

    if (reservedHeight > 0) {
      const firstFlowElement = wrapper.nextElementSibling;
      if (firstFlowElement instanceof HTMLElement) {
        const baseMarginTop = parseFloat(getComputedStyle(firstFlowElement).marginTop) || 0;
        const grid = gridUnit ?? reservedHeight;
        firstFlowElement.dataset.openingFlowOffset = "1";
        firstFlowElement.dataset.openingBaseMargin = firstFlowElement.style.marginTop;
        firstFlowElement.style.setProperty("margin-top", `${baseMarginTop + reservedHeight}px`, "important");

        const adjustment = this.measureOpeningOffsetDelta(contentElement, options, grid, reservedHeight);
        firstFlowElement.style.setProperty(
          "margin-top",
          `${baseMarginTop + reservedHeight + adjustment}px`,
          "important",
        );
      }
    }
  }

  private layoutMergedOpening(contentElement: HTMLElement, options: RendererOptions, gridUnit?: number) {
    const { isTwoColumn, columnWidth } = computeLayoutInfo(options);
    const followingSpine = contentElement.querySelector<HTMLElement>(":scope > .epub-following-spine-opening");
    const existingWrapper = followingSpine?.querySelector<HTMLElement>(":scope > .epub-merged-opening-block");

    if (!followingSpine) return;

    if (!isTwoColumn) {
      if (existingWrapper) {
        this.unwrapOpeningBlock(existingWrapper);
      }
      followingSpine.style.removeProperty("min-height");
      followingSpine.style.removeProperty("padding-top");
      return;
    }

    const openingHeading = Array.from(followingSpine.children).find(
      (child) => child instanceof HTMLElement && (child.tagName === "H1" || child.tagName === "H2"),
    );

    if (!(openingHeading instanceof HTMLElement)) return;

    const wrapper = existingWrapper ?? document.createElement("div");
    if (!existingWrapper) {
      wrapper.className = "epub-merged-opening-block";
      followingSpine.insertBefore(wrapper, openingHeading);
      wrapper.appendChild(openingHeading);
    }

    const pageFillHeight = this.getPageFillHeight(options, gridUnit);
    this.setFixedPageBox(wrapper, columnWidth, pageFillHeight);
    wrapper.style.marginLeft = "0";
    wrapper.style.marginRight = "0";
    followingSpine.style.paddingTop = "0";
  }

  private getPageFillHeight(options: RendererOptions, minimumHeight: number = 1) {
    return Math.max(minimumHeight, options.container.clientHeight - (isIOS ? 1 : 0));
  }

  private setFixedPageBox(element: HTMLElement, width: number, height: number) {
    element.style.boxSizing = "border-box";
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    element.style.minHeight = `${height}px`;
    element.style.maxHeight = `${height}px`;
    element.style.overflow = "hidden";
  }

  private measureOpeningOffsetDelta(
    contentElement: HTMLElement,
    options: RendererOptions,
    gridUnit: number,
    reservedHeight: number,
  ) {
    const layout = computeLayoutInfo(options);
    const contentRect = contentElement.getBoundingClientRect();
    const columnBoundary = contentRect.left + layout.margin + layout.columnWidth + layout.gap / 2;

    const collectLineTops = (column: "left" | "right") => {
      const tops: number[] = [];

      for (const element of Array.from(contentElement.querySelectorAll<HTMLElement>("p"))) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

        while (walker.nextNode()) {
          const textNode = walker.currentNode;
          if (!textNode.textContent?.trim()) continue;

          const range = document.createRange();
          range.selectNodeContents(textNode);

          for (const rect of Array.from(range.getClientRects())) {
            if (rect.height === 0 || rect.width === 0) continue;

            const isLeftColumn = rect.left < columnBoundary;
            if ((column === "left" && !isLeftColumn) || (column === "right" && isLeftColumn)) continue;

            const top = Math.round((rect.top - contentRect.top) * 100) / 100;
            if (!tops.some((existing) => Math.abs(existing - top) < 1)) {
              tops.push(top);
            }
          }
        }
      }

      return tops.sort((a, b) => a - b);
    };

    const minimumVisibleTop = gridUnit / 2;
    const leftTops = collectLineTops("left").filter(
      (top) => top >= Math.max(minimumVisibleTop, reservedHeight - gridUnit),
    );
    const rightTops = collectLineTops("right").filter((top) => top >= minimumVisibleTop);

    if (leftTops.length === 0 || rightTops.length === 0) {
      return 0;
    }

    const leftOffset = ((leftTops[0]! % gridUnit) + gridUnit) % gridUnit;
    const rightOffset = ((rightTops[0]! % gridUnit) + gridUnit) % gridUnit;
    let adjustment = rightOffset - leftOffset;

    if (adjustment > gridUnit / 2) {
      adjustment -= gridUnit;
    } else if (adjustment < -gridUnit / 2) {
      adjustment += gridUnit;
    }

    return adjustment;
  }

  private createOpeningBlock(contentElement: HTMLElement) {
    const openingHeading = Array.from(contentElement.children).find(
      (child) => child instanceof HTMLElement && (child.tagName === "H1" || child.tagName === "H2"),
    );

    if (!(openingHeading instanceof HTMLElement)) {
      return null;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "epub-opening-block";
    contentElement.insertBefore(wrapper, openingHeading);
    wrapper.appendChild(openingHeading);

    const nextSibling = wrapper.nextElementSibling;
    if (nextSibling instanceof HTMLElement && nextSibling.tagName === "HR") {
      wrapper.appendChild(nextSibling);
    }

    return wrapper;
  }

  private unwrapOpeningBlock(wrapper: HTMLElement) {
    const parent = wrapper.parentElement;
    if (!parent) return;

    while (wrapper.firstChild) {
      parent.insertBefore(wrapper.firstChild, wrapper);
    }
    wrapper.remove();
  }
}
