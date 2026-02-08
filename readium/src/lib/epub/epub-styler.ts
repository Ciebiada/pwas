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

    const { columnWidth, gap } = computeLayoutInfo(options);

    if (isIOS) {
      contentElement.dataset.iosFirstColumnFix = "1";
    } else {
      delete contentElement.dataset.iosFirstColumnFix;
    }

    contentElement.style.cssText = `
            --user-font-scale: ${userScale};
            box-sizing: border-box;
            font-size: ${fontSize}%;
            font-family: ${fontFamily};
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
            }
            .epub-content[data-ios-first-column-fix="1"]::before {
                content: "";
                display: block;
                height: 1px;
                width: 100%;
            }
            .epub-content * {
                font-family: ${fontFamily} !important;
                color: var(--text-strong-color) !important;
                line-height: 1 !important;
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

  snapMarginsToGrid(contentElement: HTMLElement | null, fontSize: number) {
    if (!contentElement) return;

    const gridUnit = Math.round(fontSize * 0.16 * 1.6);
    const elements = contentElement.querySelectorAll(
      "h1, h2, h3, h4, h5, h6, p, blockquote, div, section, article, ul, ol, li, pre, figure, dt, dd",
    );

    elements.forEach((el) => {
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
    });

    const images = contentElement.querySelectorAll("img, svg");
    images.forEach((el) => {
      const element = el as HTMLElement;
      const rect = element.getBoundingClientRect();
      if (rect.height > 0) {
        const snappedHeight = Math.round(rect.height / gridUnit) * gridUnit;
        element.style.height = `${snappedHeight}px`;
      }
    });

    // Handle elements with font-size larger than the grid unit
    const textElements = contentElement.querySelectorAll("h1, h2, h3, h4, h5, h6, p, div, span, a");
    textElements.forEach((el) => {
      const element = el as HTMLElement;
      const computed = getComputedStyle(element);
      const fontSize = parseFloat(computed.fontSize);

      if (fontSize > gridUnit) {
        const multiple = Math.ceil(fontSize / gridUnit);
        const newLineHeight = multiple * gridUnit;
        element.style.setProperty("line-height", `${newLineHeight}px`, "important");
      }
    });
  }
}
