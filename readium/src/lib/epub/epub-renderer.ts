import { type CFI, CFIHelper } from "./epub-cfi";
import { computeLayoutInfo } from "./epub-layout";
import type { EpubParser } from "./epub-parser";
import { EpubStyler } from "./epub-styler";
import type { EpubLocation, EpubPackage, RendererOptions } from "./epub-types";
import { LocationTracker } from "./location-tracker";
import { ResourceResolver } from "./resource-resolver";

type SpineSlot = {
  leadingSpineIndex: number;
  renderedSpineCount: number;
  leadingMergedColumnCount: number;
  shadowHost: HTMLElement;
  shadowRoot: ShadowRoot;
  contentElement: HTMLElement;
  totalPages: number;
  buildPromise: Promise<void>;
};

const ACTIVE_HOST_CLASS = "epub-shadow-host";
const INACTIVE_HOST_CLASS = "epub-shadow-host-prerender";
const MAX_SLOT_CACHE = 5;

export class EpubRenderer {
  private parser: EpubParser;
  private package: EpubPackage;
  private options: RendererOptions;

  private resourceResolver: ResourceResolver;
  private epubStyler: EpubStyler;
  private locationTracker: LocationTracker;

  private slots = new Map<number, SpineSlot>();
  private slotLru: number[] = [];
  private activeSlot: SpineSlot | null = null;

  private currentSpineIndex: number = 0;
  private currentPage: number = 0;
  private lastKnownCfi: string | undefined;
  private sparseOpeningSpineCache = new Map<number, boolean>();

  private isBusy: boolean = false;
  private prefetchToken: number = 0;
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
        await this.displayCFI(target, true);
      } else if (typeof target === "number") {
        await this.activateLeadingIndex(target, 0);
      } else {
        await this.activateLeadingIndex(0, 0);
      }
    } finally {
      this.isBusy = false;
      this.notifyRelocated(false);
      this.schedulePrefetchNeighbors();
    }
  }

  async displayCFI(cfi: CFI, internal: boolean = false): Promise<void> {
    if (!internal && this.isBusy) return;
    if (!internal) this.isBusy = true;

    try {
      const parsed = CFIHelper.parse(cfi);
      if (!parsed) {
        await this.activateLeadingIndex(0, 0);
        return;
      }

      const slot = await this.activateLeadingIndex(parsed.spineIndex, 0);

      if (parsed.path) {
        const element = CFIHelper.getElementByPath(slot.contentElement, parsed.path);
        if (element instanceof HTMLElement) {
          const { pageStride, margin } = this.getPaginationMetrics(slot.contentElement);

          const dpr = (globalThis as unknown as { devicePixelRatio?: number }).devicePixelRatio ?? 1;
          const fuzzPx = Math.max(2, Math.min(10, dpr * 2));

          let elementLeft: number | undefined;
          if (parsed.offset > 0) {
            const rect = CFIHelper.getTargetCharClientRect(element, parsed.offset);
            if (rect) {
              const contentRect = slot.contentElement.getBoundingClientRect();
              elementLeft = rect.left - contentRect.left;
            }
          }

          if (elementLeft === undefined) {
            elementLeft = this.locationTracker.getVirtualOffsetLeft(element, slot.contentElement);
          }

          let pageIndex = Math.floor((elementLeft - margin + fuzzPx) / pageStride);
          pageIndex = Math.max(0, Math.min(pageIndex, slot.totalPages - 1));

          const screenStart = pageIndex * pageStride + margin;
          const screenEnd = screenStart + pageStride;

          if (elementLeft < screenStart - fuzzPx) {
            pageIndex -= 1;
          } else if (elementLeft > screenEnd + fuzzPx) {
            pageIndex += 1;
          }
          pageIndex = Math.max(0, Math.min(pageIndex, slot.totalPages - 1));

          this.goToPage(pageIndex, true);
        } else {
          console.warn("[Renderer] CFI path not found in document:", parsed.path);
        }
      }
    } finally {
      if (!internal) {
        this.isBusy = false;
        this.notifyRelocated(false);
        this.schedulePrefetchNeighbors();
      }
    }
  }

  async next(): Promise<boolean> {
    if (this.isBusy || !this.activeSlot) return false;

    const targetPage = this.getNextPageTarget(this.currentPage);
    if (targetPage <= this.activeSlot.totalPages - 1) {
      this.goToPage(targetPage);
      return true;
    }

    const nextLeading = this.activeSlot.leadingSpineIndex + this.activeSlot.renderedSpineCount;
    if (nextLeading > this.package.spine.length - 1) return false;

    this.isBusy = true;
    try {
      await this.activateLeadingIndex(nextLeading, 0);
    } finally {
      this.isBusy = false;
      this.notifyRelocated(false);
      this.schedulePrefetchNeighbors();
    }
    return true;
  }

  async prev(): Promise<boolean> {
    if (this.isBusy || !this.activeSlot) return false;

    const targetPage = this.getPrevPageTarget(this.currentPage);
    if (targetPage >= 0) {
      this.goToPage(targetPage);
      return true;
    }

    const prevLeading = await this.getPreviousLeadingIndex(this.activeSlot.leadingSpineIndex);
    if (prevLeading === null) return false;

    this.isBusy = true;
    try {
      await this.activateLeadingIndex(prevLeading, "last");
    } finally {
      this.isBusy = false;
      this.notifyRelocated(false);
      this.schedulePrefetchNeighbors();
    }
    return true;
  }

  private async activateLeadingIndex(leadingIndex: number, pageTarget: number | "last"): Promise<SpineSlot> {
    if (leadingIndex < 0 || leadingIndex >= this.package.spine.length) {
      throw new Error(`Invalid spine index: ${leadingIndex}`);
    }

    const slot = await this.ensureSlot(leadingIndex);
    this.setActiveSlot(slot);
    this.currentSpineIndex = slot.leadingSpineIndex;
    const targetPage = pageTarget === "last" ? this.getLastPageForNavigation(slot.totalPages) : pageTarget;
    this.goToPage(targetPage, true);
    return slot;
  }

  private async ensureSlot(leadingIndex: number): Promise<SpineSlot> {
    const existing = this.slots.get(leadingIndex);
    if (existing) {
      await existing.buildPromise;
      this.touchLru(leadingIndex);
      return existing;
    }
    return this.createSlot(leadingIndex);
  }

  private async createSlot(leadingIndex: number): Promise<SpineSlot> {
    const shadowHost = document.createElement("div");
    shadowHost.className = INACTIVE_HOST_CLASS;
    shadowHost.style.cssText =
      "position: absolute; inset: 0; width: 100%; height: 100%; visibility: hidden; pointer-events: none;";
    this.options.container.appendChild(shadowHost);
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });

    const contentElement = document.createElement("div");
    contentElement.className = "epub-content";
    shadowRoot.appendChild(contentElement);

    const slot: SpineSlot = {
      leadingSpineIndex: leadingIndex,
      renderedSpineCount: 1,
      leadingMergedColumnCount: 0,
      shadowHost,
      shadowRoot,
      contentElement,
      totalPages: 1,
      buildPromise: Promise.resolve(),
    };

    this.slots.set(leadingIndex, slot);
    this.touchLru(leadingIndex);

    slot.buildPromise = this.populateSlot(slot).catch((err) => {
      console.error("[Renderer] Failed to build spine slot", leadingIndex, err);
      this.slots.delete(leadingIndex);
      this.slotLru = this.slotLru.filter((i) => i !== leadingIndex);
      shadowHost.remove();
      throw err;
    });
    await slot.buildPromise;
    this.evictIfNeeded();
    return slot;
  }

  private async populateSlot(slot: SpineSlot): Promise<void> {
    const { attributes, leadingMergedColumnCount, processedHtml, renderedSpineCount } = await this.buildRenderableSpine(
      slot.leadingSpineIndex,
    );
    if (!slot.shadowHost.isConnected) return;

    slot.renderedSpineCount = renderedSpineCount;
    slot.leadingMergedColumnCount = leadingMergedColumnCount;

    this.renderIntoSlot(slot, processedHtml, attributes);
    await this.waitResourcesReady(slot.contentElement);
    if (!slot.shadowHost.isConnected) return;
    void slot.contentElement.offsetWidth;
    slot.totalPages = this.measurePages(slot);
  }

  private renderIntoSlot(slot: SpineSlot, html: string, attributes: Record<string, string>) {
    slot.contentElement.className = "epub-content";
    Object.keys(attributes).forEach((key) => {
      if (key === "class") {
        slot.contentElement.classList.add(...(attributes[key] || "").split(" "));
      } else {
        slot.contentElement.setAttribute(key, attributes[key] || "");
      }
    });
    slot.contentElement.innerHTML = html;
    this.epubStyler.applyStyles(slot.contentElement, slot.shadowRoot, this.options, false);
    this.epubStyler.snapMarginsToGrid(slot.contentElement, this.options.fontSize, this.options);
  }

  private setActiveSlot(slot: SpineSlot) {
    if (this.activeSlot === slot) {
      this.touchLru(slot.leadingSpineIndex);
      return;
    }
    if (this.activeSlot) {
      this.activeSlot.shadowHost.className = INACTIVE_HOST_CLASS;
      this.activeSlot.shadowHost.style.visibility = "hidden";
      this.activeSlot.shadowHost.style.pointerEvents = "none";
    }
    this.activeSlot = slot;
    slot.shadowHost.className = ACTIVE_HOST_CLASS;
    slot.shadowHost.style.visibility = "visible";
    slot.shadowHost.style.pointerEvents = "";
    this.touchLru(slot.leadingSpineIndex);
  }

  private goToPage(pageIndex: number, internal: boolean = false) {
    if (!this.activeSlot) return;
    const slot = this.activeSlot;
    this.currentPage = Math.max(0, Math.min(pageIndex, slot.totalPages - 1));
    const { pageStride } = this.getPaginationMetrics(slot.contentElement);
    const translateX = -(this.currentPage * pageStride);
    slot.contentElement.style.transform = `translateX(${translateX}px)`;
    if (!internal) {
      this.notifyRelocated(true);
    }
  }

  private measurePages(slot: SpineSlot): number {
    const { pageStride, margin } = this.getPaginationMetrics(slot.contentElement);
    const contentRect = slot.contentElement.getBoundingClientRect();
    let maxRight = margin;

    const updateMaxRight = (rect: DOMRect) => {
      if (rect.width === 0 || rect.height === 0) return;
      maxRight = Math.max(maxRight, rect.right - contentRect.left);
    };

    for (const element of Array.from(
      slot.contentElement.querySelectorAll<HTMLElement>(
        "p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, img, svg, hr",
      ),
    )) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let foundText = false;

      while (walker.nextNode()) {
        const textNode = walker.currentNode;
        if (!textNode.textContent?.trim()) continue;

        foundText = true;
        const range = document.createRange();
        range.selectNodeContents(textNode);

        for (const rect of Array.from(range.getClientRects())) {
          updateMaxRight(rect);
        }
      }

      if (foundText) continue;

      for (const rect of Array.from(element.getClientRects())) {
        updateMaxRight(rect);
      }
    }

    const computedPages = Math.max(1, Math.ceil((maxRight - margin) / pageStride));
    return Math.max(1, computedPages - slot.leadingMergedColumnCount);
  }

  private getLayoutInfo() {
    return computeLayoutInfo(this.options);
  }

  private getPaginationMetrics(contentElement: HTMLElement | null) {
    const layout = this.getLayoutInfo();
    if (!contentElement) {
      return { margin: layout.margin, pageStride: layout.pageStride };
    }

    const style = getComputedStyle(contentElement);
    const columnWidth = Number.parseFloat(style.columnWidth);
    const columnGap = Number.parseFloat(style.columnGap);
    const paddingLeft = Number.parseFloat(style.paddingLeft);

    const measuredPageStride =
      Number.isFinite(columnWidth) && columnWidth > 0 && Number.isFinite(columnGap) && columnGap >= 0
        ? columnWidth + columnGap
        : layout.pageStride;
    const measuredMargin = Number.isFinite(paddingLeft) && paddingLeft >= 0 ? paddingLeft : layout.margin;

    return {
      margin: measuredMargin,
      pageStride: measuredPageStride,
    };
  }

  private isTwoColumnLayout() {
    return this.getLayoutInfo().isTwoColumn;
  }

  private getPageTurnStep() {
    return this.isTwoColumnLayout() ? 2 : 1;
  }

  private normalizePageForLayout(pageIndex: number) {
    if (!this.isTwoColumnLayout()) return pageIndex;
    return pageIndex - (pageIndex % 2);
  }

  private getNextPageTarget(currentPage: number) {
    if (!this.isTwoColumnLayout()) return currentPage + 1;
    return this.normalizePageForLayout(currentPage) + this.getPageTurnStep();
  }

  private getPrevPageTarget(currentPage: number) {
    if (!this.isTwoColumnLayout()) return currentPage - 1;

    const spreadStart = this.normalizePageForLayout(currentPage);
    if (currentPage !== spreadStart) return spreadStart;
    return spreadStart - this.getPageTurnStep();
  }

  private getLastPageForNavigation(totalPages: number) {
    return this.normalizePageForLayout(totalPages - 1);
  }

  private getManifestItemBySpineIndex(index: number) {
    const spineItem = this.package.spine[index];
    if (!spineItem) return null;

    return this.package.manifest.get(spineItem.idref) ?? null;
  }

  private isSparseOpeningDocument(doc: Document) {
    const body = doc.querySelector("body");
    if (!body) return false;

    const disallowedContent = body.querySelector(
      "img, svg, figure, table, ul, ol, blockquote, pre, audio, video, iframe, canvas, form",
    );
    if (disallowedContent) return false;

    const meaningfulChildren = Array.from(body.children).filter((child) => {
      const text = child.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return text.length > 0;
    });

    if (meaningfulChildren.length === 0 || meaningfulChildren.length > 2) {
      return false;
    }

    const headingCount = Array.from(body.children).filter((child) =>
      /^h[1-6]$/.test(child.tagName.toLowerCase()),
    ).length;
    const totalTextLength = meaningfulChildren.reduce((sum, child) => {
      const text = child.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return sum + text.length;
    }, 0);

    return headingCount >= 1 && totalTextLength <= 120;
  }

  private async isSparseOpeningSpine(index: number) {
    const cached = this.sparseOpeningSpineCache.get(index);
    if (cached !== undefined) return cached;
    const manifestItem = this.getManifestItemBySpineIndex(index);
    if (!manifestItem) return false;

    const htmlContent = await this.parser.getFileAsText(this.parser.resolvePath(manifestItem.href));
    const doc = this.parser.parseMarkup(htmlContent, manifestItem.mediaType);
    const isSparse = this.isSparseOpeningDocument(doc);
    this.sparseOpeningSpineCache.set(index, isSparse);
    return isSparse;
  }

  private async shouldMergeWithFollowingSpine(index: number) {
    const { isTwoColumn } = this.getLayoutInfo();
    if (!isTwoColumn) return false;

    const nextManifestItem = this.getManifestItemBySpineIndex(index + 1);
    if (!nextManifestItem) return false;

    return this.isSparseOpeningSpine(index);
  }

  private async getPreviousLeadingIndex(leadingIndex: number): Promise<number | null> {
    if (leadingIndex <= 0) return null;
    if (leadingIndex >= 2 && (await this.shouldMergeWithFollowingSpine(leadingIndex - 2))) {
      return leadingIndex - 2;
    }
    return leadingIndex - 1;
  }

  private async buildRenderableSpine(index: number) {
    const manifestItem = this.getManifestItemBySpineIndex(index);

    if (!manifestItem) {
      throw new Error(`Manifest item not found for spine index ${index}`);
    }

    const htmlContent = await this.parser.getFileAsText(this.parser.resolvePath(manifestItem.href));
    const doc = this.parser.parseMarkup(htmlContent, manifestItem.mediaType);

    await this.resourceResolver.resolveImages(doc, manifestItem.href);
    this.resourceResolver.resolveLinks(doc);

    let combinedStyles = await this.epubStyler.resolveCombinedStyles(doc, manifestItem.href);
    let bodyHtml = this.parser.serializeBodyInnerHtml(doc);
    let renderedSpineCount = 1;
    let leadingMergedColumnCount = 0;

    const nextManifestItem = this.getManifestItemBySpineIndex(index + 1);
    const shouldMerge = nextManifestItem !== null && (await this.shouldMergeWithFollowingSpine(index));

    if (shouldMerge && nextManifestItem) {
      const nextHtmlContent = await this.parser.getFileAsText(this.parser.resolvePath(nextManifestItem.href));
      const nextDoc = this.parser.parseMarkup(nextHtmlContent, nextManifestItem.mediaType);

      await this.resourceResolver.resolveImages(nextDoc, nextManifestItem.href);
      this.resourceResolver.resolveLinks(nextDoc);

      combinedStyles += await this.epubStyler.resolveCombinedStyles(nextDoc, nextManifestItem.href);
      bodyHtml += `<div class="epub-following-spine">${this.parser.serializeBodyInnerHtml(nextDoc)}</div>`;
      renderedSpineCount = 2;
      leadingMergedColumnCount = 1;
    }

    const attributes: Record<string, string> = {};
    const body = doc.querySelector("body");
    if (body) {
      Array.from(body.attributes).forEach((attr) => {
        attributes[attr.name] = attr.value;
      });
    }

    return {
      attributes,
      leadingMergedColumnCount,
      processedHtml: combinedStyles + bodyHtml,
      renderedSpineCount,
    };
  }

  private async waitResourcesReady(contentElement: HTMLElement): Promise<void> {
    const promises: Promise<unknown>[] = [];

    try {
      promises.push((document as unknown as { fonts: { ready: Promise<void> } }).fonts.ready);
    } catch (e) {
      console.warn("[Renderer] Font loading timeout or error", e);
    }

    const images = Array.from(contentElement.querySelectorAll("img"));
    images.forEach((img) => {
      if (!img.complete) {
        promises.push(
          new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          }),
        );
      }
      if ("decode" in img) {
        promises.push(img.decode().catch(() => {}));
      }
    });

    await Promise.all(promises);
  }

  async handleResize() {
    if (this.isBusy || !this.activeSlot) return;
    this.isBusy = true;

    try {
      const activeIndex = this.activeSlot.leadingSpineIndex;
      for (const [index, slot] of Array.from(this.slots.entries())) {
        if (index === activeIndex) continue;
        this.destroySlot(slot);
        this.slots.delete(index);
      }
      this.slotLru = this.slotLru.filter((i) => i === activeIndex);

      const cfi = this.lastKnownCfi;

      this.epubStyler.applyStyles(this.activeSlot.contentElement, this.activeSlot.shadowRoot, this.options, true);
      this.epubStyler.snapMarginsToGrid(this.activeSlot.contentElement, this.options.fontSize, this.options);
      await this.waitResourcesReady(this.activeSlot.contentElement);
      void this.activeSlot.contentElement.offsetWidth;
      this.activeSlot.totalPages = this.measurePages(this.activeSlot);

      if (cfi) {
        await this.displayCFI(cfi, true);
      } else {
        this.goToPage(this.currentPage, true);
      }
    } finally {
      this.isBusy = false;
      this.notifyRelocated(false);
      this.schedulePrefetchNeighbors();
    }
  }

  private touchLru(index: number) {
    const i = this.slotLru.indexOf(index);
    if (i !== -1) this.slotLru.splice(i, 1);
    this.slotLru.push(index);
  }

  private evictIfNeeded() {
    while (this.slotLru.length > MAX_SLOT_CACHE) {
      const victimIndex = this.slotLru[0]!;
      const victim = this.slots.get(victimIndex);
      if (!victim) {
        this.slotLru.shift();
        continue;
      }
      if (victim === this.activeSlot) {
        // Skip the active slot; move it to the end so it isn't reconsidered.
        this.slotLru.shift();
        this.slotLru.push(victimIndex);
        if (this.slotLru.length <= MAX_SLOT_CACHE) break;
        continue;
      }
      this.slotLru.shift();
      this.destroySlot(victim);
      this.slots.delete(victimIndex);
    }
  }

  private destroySlot(slot: SpineSlot) {
    slot.contentElement.innerHTML = "";
    slot.shadowHost.remove();
  }

  private destroyAllSlots() {
    for (const slot of this.slots.values()) {
      this.destroySlot(slot);
    }
    this.slots.clear();
    this.slotLru = [];
    this.activeSlot = null;
  }

  private schedulePrefetchNeighbors() {
    const token = ++this.prefetchToken;
    const active = this.activeSlot;
    if (!active) return;

    const runSoon = (fn: () => void) => {
      const idle = (globalThis as unknown as { requestIdleCallback?: (cb: () => void, opts?: object) => number })
        .requestIdleCallback;
      if (typeof idle === "function") {
        idle(fn, { timeout: 500 });
      } else {
        setTimeout(fn, 16);
      }
    };

    runSoon(async () => {
      if (token !== this.prefetchToken || this.activeSlot !== active) return;

      const nextLeading = active.leadingSpineIndex + active.renderedSpineCount;
      if (nextLeading <= this.package.spine.length - 1 && !this.slots.has(nextLeading)) {
        this.ensureSlot(nextLeading).catch(() => {});
      }

      if (token !== this.prefetchToken) return;
      const prevLeading = await this.getPreviousLeadingIndex(active.leadingSpineIndex);
      if (prevLeading !== null && token === this.prefetchToken && !this.slots.has(prevLeading)) {
        this.ensureSlot(prevLeading).catch(() => {});
      }
    });
  }

  getCurrentLocation(basicOnly: boolean = false): EpubLocation {
    const slot = this.activeSlot;
    const { containerWidth } = this.getLayoutInfo();
    const loc = this.locationTracker.getCurrentLocation(
      slot?.contentElement ?? null,
      this.currentPage,
      slot?.totalPages ?? 1,
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
    this.prefetchToken++;
    this.destroyAllSlots();
  }
}
