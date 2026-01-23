import type { EpubParser } from "./epub-parser";

export class ResourceResolver {
  private resourceCache: Map<string, string> = new Map();

  constructor(private parser: EpubParser) {}

  resolveRelativePath(path: string, baseHref: string): string {
    if (path.startsWith("http") || path.startsWith("/")) {
      return path;
    }
    const basePath = baseHref.substring(0, baseHref.lastIndexOf("/") + 1);
    const combined = basePath + path;
    return this.normalizePath(combined);
  }

  normalizePath(path: string): string {
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

  async resolveImages(doc: Document, baseHref: string): Promise<void> {
    const images = Array.from(doc.querySelectorAll("img"));
    const svgImages = Array.from(doc.querySelectorAll("image"));
    const allImages = [...images, ...svgImages];

    for (const img of allImages) {
      const src = img.getAttribute("src") || img.getAttribute("xlink:href") || img.getAttribute("href");
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

            if (img.tagName.toLowerCase() === "img") {
              const tempImg = new Image();
              tempImg.src = url;
              try {
                await tempImg.decode();
                img.setAttribute("width", tempImg.naturalWidth.toString());
                img.setAttribute("height", tempImg.naturalHeight.toString());
              } catch (decodeErr) {
                console.warn(`[ResourceResolver] Failed to decode image: ${resolvedPath}`, decodeErr);
              }
            }

            this.setImageSource(img, url);
          }
        } catch (e) {
          console.warn(`[ResourceResolver] Failed to load image: ${resolvedPath}`, e);
        }
      }
    }
  }

  setImageSource(element: Element, url: string) {
    if (element.tagName.toLowerCase() === "image") {
      element.setAttribute("xlink:href", url);
      element.setAttribute("href", url);
    } else {
      element.setAttribute("src", url);
    }
  }

  resolveLinks(doc: Document) {
    const links = doc.querySelectorAll("a[href]");
    links.forEach((link) => {
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      link.setAttribute("data-internal-link", href);
      link.setAttribute("href", "#");
    });
  }

  async resolveUrlsInCss(css: string, baseHref: string): Promise<string> {
    const urlRegex = /url\(['"]?([^'")]*)['"]?\)/g;
    const matches = Array.from(css.matchAll(urlRegex));
    let resolvedCss = css;

    for (const match of matches) {
      const originalUrl = match[1];
      if (!originalUrl || originalUrl.startsWith("data:") || originalUrl.startsWith("http")) continue;

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
          console.warn(`[ResourceResolver] Failed to resolve CSS URL: ${resolvedPath}`, e);
        }
      }
    }
    return resolvedCss;
  }

  destroy() {
    this.resourceCache.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    this.resourceCache.clear();
  }
}
