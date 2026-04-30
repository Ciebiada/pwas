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

type RendererBusyState = {
  active: boolean;
  label?: string;
};

export type PaginationIndexUnit = {
  leadingSpineIndex: number;
  renderedSpineCount: number;
  pageCount: number;
  pageStart: number;
};

export type PaginationIndexSnapshot = {
  units: PaginationIndexUnit[];
  totalPages: number;
};

const ACTIVE_HOST_CLASS = "epub-shadow-host";
const INACTIVE_HOST_CLASS = "epub-shadow-host-prerender";
const MAX_SLOT_CACHE = 5;
const PAGE_TURN_TRANSITION = "transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)";
const PAGINATION_FRAME_BUDGET_MS = 6;
const RESOURCE_READY_TIMEOUT_MS = 2500;

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
  private stableResizeCfi: string | undefined;
  private stableResizeAnchorTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingPercentageSeekTimer: ReturnType<typeof setTimeout> | undefined;
  private sparseOpeningSpineCache = new Map<number, boolean>();
  private pendingPercentageSeek: number | null = null;
  private estimatedPagesBySpineIndex = new Map<number, number>();
  private estimatedPagination: {
    pageCounts: number[];
    pageStarts: number[];
    totalPages: number;
  } | null = null;
  private exactPaginationIndex: PaginationIndexSnapshot | null = null;
  private exactPaginationIndexPromise: Promise<void> | null = null;
  private paginationIndexVersion: number = 0;

  private isBusy: boolean = false;
  private hasPendingResize: boolean = false;
  private prefetchToken: number = 0;
  private resizeObserver: ResizeObserver;
  private reducedMotionQuery: MediaQueryList;
  private onRelocated?: (location: EpubLocation) => void;
  private onBusy?: (state: RendererBusyState) => void;
  private onPaginationIndexReady?: (snapshot: PaginationIndexSnapshot) => void;
  private onPaginationIndexInvalidated?: () => void;
  private foregroundWorkDepth: number = 0;
  private isDestroyed: boolean = false;

  constructor(parser: EpubParser, packageData: EpubPackage, options: RendererOptions) {
    this.parser = parser;
    this.package = packageData;
    this.options = options;

    this.resourceResolver = new ResourceResolver(parser);
    this.epubStyler = new EpubStyler(parser, this.resourceResolver);
    this.locationTracker = new LocationTracker(packageData);
    this.reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    this.resizeObserver = new ResizeObserver(() => {
      void this.handleResize();
    });
    this.resizeObserver.observe(this.options.container);
  }

  setOnRelocated(callback: (location: EpubLocation) => void) {
    this.onRelocated = callback;
  }

  setOnBusy(callback: (state: RendererBusyState) => void) {
    this.onBusy = callback;
    callback({ active: this.foregroundWorkDepth > 0 });
  }

  setOnPaginationIndexReady(callback: (snapshot: PaginationIndexSnapshot) => void) {
    this.onPaginationIndexReady = callback;
    const snapshot = this.getExactPaginationIndexSnapshot();
    if (snapshot) callback(snapshot);
  }

  setOnPaginationIndexInvalidated(callback: () => void) {
    this.onPaginationIndexInvalidated = callback;
  }

  getPaginationMapSignature() {
    const layout = this.getLayoutInfo();
    const spineFingerprint = this.hashString(this.package.spine.map((item) => `${item.idref}:${item.size}`).join(","));

    return [
      "pagination-map-v1",
      `w=${Math.max(1, Math.round(layout.containerWidth))}`,
      `h=${Math.max(1, Math.round(this.options.container.clientHeight))}`,
      `cols=${layout.isTwoColumn ? 2 : 1}`,
      `fontSize=${this.options.fontSize}`,
      `fontFamily=${this.options.fontFamily}`,
      `margin=${this.options.margin}`,
      `spine=${spineFingerprint}`,
    ].join("|");
  }

  getExactPaginationIndexSnapshot(): PaginationIndexSnapshot | null {
    if (!this.exactPaginationIndex) return null;
    return this.clonePaginationIndex(this.exactPaginationIndex);
  }

  restoreExactPaginationIndex(snapshot: PaginationIndexSnapshot) {
    if (!this.isValidPaginationIndex(snapshot)) return false;

    this.exactPaginationIndex = this.clonePaginationIndex(snapshot);
    this.exactPaginationIndexPromise = null;
    this.notifyRelocated(false);
    return true;
  }

  async ensureExactPaginationIndexBackground(): Promise<void> {
    if (this.isDestroyed || this.exactPaginationIndex) return;

    await this.waitUntilForegroundIdle();
    if (this.isDestroyed || this.exactPaginationIndex) return;

    await this.ensureExactPaginationIndex();
  }

  async display(target?: string | number): Promise<void> {
    if (this.isBusy) return;
    this.isBusy = true;
    this.beginForegroundWork("Loading page");

    try {
      await this.yieldToMain();
      if (typeof target === "string" && target.startsWith("epubcfi(")) {
        await this.displayCFI(target, true);
      } else if (typeof target === "number") {
        await this.activateLeadingIndex(target, 0);
      } else {
        await this.activateLeadingIndex(0, 0);
      }
    } finally {
      this.isBusy = false;
      this.endForegroundWork();
      this.notifyRelocated(false);
      this.schedulePrefetchNeighbors();
      this.flushPendingResize();
    }
  }

  async displayCFI(cfi: CFI, internal: boolean = false): Promise<void> {
    if (!internal && this.isBusy) return;
    if (!internal) this.isBusy = true;
    if (!internal) {
      this.beginForegroundWork("Loading page");
      await this.yieldToMain();
    }

    try {
      const parsed = CFIHelper.parse(cfi);
      if (!parsed) {
        await this.activateLeadingIndex(0, 0);
        return;
      }

      const slot = await this.activateLeadingIndex(await this.getLeadingIndexForSpine(parsed.spineIndex), 0);

      if (parsed.path) {
        const element = this.getElementForCfi(slot, parsed.spineIndex, parsed.path);
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

          this.goToPage(this.normalizePageForLayout(pageIndex), true);
        } else {
          console.warn("[Renderer] CFI path not found in document:", parsed.path);
        }
      }
    } finally {
      if (!internal) {
        this.isBusy = false;
        this.endForegroundWork();
        this.notifyRelocated(false);
        this.schedulePrefetchNeighbors();
        this.flushPendingResize();
      }
    }
  }

  async next(): Promise<boolean> {
    if (this.isBusy || !this.activeSlot) return false;
    this.clearPendingPercentageSeek();

    const targetPage = this.getNextPageTarget(this.currentPage);
    if (targetPage <= this.activeSlot.totalPages - 1) {
      this.goToPage(targetPage);
      return true;
    }

    const nextLeading = this.activeSlot.leadingSpineIndex + this.activeSlot.renderedSpineCount;
    if (nextLeading > this.package.spine.length - 1) return false;

    this.isBusy = true;
    this.beginForegroundWork("Loading chapter");
    try {
      await this.yieldToMain();
      await this.activateLeadingIndex(nextLeading, 0);
    } finally {
      this.isBusy = false;
      this.endForegroundWork();
      this.notifyRelocated(false);
      this.schedulePrefetchNeighbors();
      this.flushPendingResize();
    }
    return true;
  }

  async prev(): Promise<boolean> {
    if (this.isBusy || !this.activeSlot) return false;
    this.clearPendingPercentageSeek();

    const targetPage = this.getPrevPageTarget(this.currentPage);
    if (targetPage >= 0) {
      this.goToPage(targetPage);
      return true;
    }

    const prevLeading = await this.getPreviousLeadingIndex(this.activeSlot.leadingSpineIndex);
    if (prevLeading === null) return false;

    this.isBusy = true;
    this.beginForegroundWork("Loading chapter");
    try {
      await this.yieldToMain();
      await this.activateLeadingIndex(prevLeading, "last");
    } finally {
      this.isBusy = false;
      this.endForegroundWork();
      this.notifyRelocated(false);
      this.schedulePrefetchNeighbors();
      this.flushPendingResize();
    }
    return true;
  }

  async seekToPercentage(percentage: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, percentage));
    this.pendingPercentageSeek = clamped;

    if (this.isBusy) {
      this.schedulePendingPercentageSeekFlush();
      return;
    }

    await this.flushPendingPercentageSeek();
  }

  private async flushPendingPercentageSeek() {
    if (this.isDestroyed || this.pendingPercentageSeek === null) return;

    if (this.isBusy) {
      this.schedulePendingPercentageSeekFlush();
      return;
    }

    this.isBusy = true;
    let targetPercentage: number | null = this.pendingPercentageSeek;
    let needsExactPagination = false;
    this.beginForegroundWork("Seeking");
    await this.yieldToMain();

    try {
      while (targetPercentage !== null) {
        this.pendingPercentageSeek = null;
        if (this.exactPaginationIndex) {
          await this.seekToPercentageInternal(targetPercentage);
        } else {
          await this.seekToEstimatedPercentageInternal(targetPercentage);
          needsExactPagination = true;
        }
        targetPercentage = this.pendingPercentageSeek;
      }
    } finally {
      this.isBusy = false;
      this.endForegroundWork();
      this.notifyRelocated(false);
      this.schedulePrefetchNeighbors();
      this.flushPendingResize();
      if (this.pendingPercentageSeek !== null) {
        this.schedulePendingPercentageSeekFlush();
      } else if (needsExactPagination && !this.exactPaginationIndex) {
        void this.ensureExactPaginationIndexBackground();
      }
    }
  }

  private schedulePendingPercentageSeekFlush() {
    if (this.pendingPercentageSeekTimer !== undefined) return;

    this.pendingPercentageSeekTimer = setTimeout(() => {
      this.pendingPercentageSeekTimer = undefined;
      void this.flushPendingPercentageSeek();
    }, 50);
  }

  private clearPendingPercentageSeek() {
    this.pendingPercentageSeek = null;
    if (this.pendingPercentageSeekTimer !== undefined) {
      clearTimeout(this.pendingPercentageSeekTimer);
      this.pendingPercentageSeekTimer = undefined;
    }
  }

  private async seekToPercentageInternal(percentage: number) {
    const target = this.getExactPageTargetForPercentage(percentage);
    await this.activateLeadingIndex(target.leadingSpineIndex, 0);
    this.goToPage(this.normalizePageForLayout(target.pageIndex), true);
  }

  private async seekToEstimatedPercentageInternal(percentage: number) {
    const target = await this.getEstimatedPageTargetForPercentage(percentage);
    await this.activateLeadingIndex(target.leadingSpineIndex, 0);
    this.goToPage(this.normalizePageForLayout(target.pageIndex), true);
  }

  getGlobalPageNumberForPercentage(percentage: number): number | null {
    const index = this.exactPaginationIndex;
    if (!index) return null;

    const zeroBasedPage = this.getExactGlobalPageIndexForPercentage(percentage, index);
    return zeroBasedPage + 1;
  }

  private getNormalizedSpineSize(index: number) {
    return Math.max(this.package.spine[index]?.size || 0, 1);
  }

  private getNormalizedSpineRangeSize(leadingIndex: number, spineCount: number) {
    let totalSize = 0;
    for (let index = leadingIndex; index < leadingIndex + spineCount && index < this.package.spine.length; index += 1) {
      totalSize += this.getNormalizedSpineSize(index);
    }
    return totalSize;
  }

  private getEstimatedPagination() {
    const cached = this.estimatedPagination;
    if (cached) return cached;

    const fallbackPagesPerSpineUnit = this.getAveragePagesPerSpineUnit();
    const pageCounts = this.package.spine.map((_, spineIndex) =>
      this.getEstimatedPagesForSpine(spineIndex, fallbackPagesPerSpineUnit),
    );
    let pageCursor = 0;
    const pageStarts = pageCounts.map((pageCount) => {
      const start = pageCursor;
      pageCursor += pageCount;
      return start;
    });

    this.estimatedPagination = {
      pageCounts,
      pageStarts,
      totalPages: Math.max(1, pageCursor),
    };
    return this.estimatedPagination;
  }

  private getAveragePagesPerSpineUnit() {
    let measuredPages = 0;
    let measuredSize = 0;

    for (const [spineIndex, pageEstimate] of this.estimatedPagesBySpineIndex) {
      measuredPages += pageEstimate;
      measuredSize += this.getNormalizedSpineSize(spineIndex);
    }

    if (measuredSize > 0) {
      return measuredPages / measuredSize;
    }

    if (this.activeSlot) {
      const activeSize = this.getNormalizedSpineRangeSize(
        this.activeSlot.leadingSpineIndex,
        this.activeSlot.renderedSpineCount,
      );
      if (activeSize > 0) {
        return Math.max(1, this.activeSlot.totalPages) / activeSize;
      }
    }

    return 1;
  }

  private getEstimatedPagesForSpine(spineIndex: number, fallbackPagesPerSpineUnit: number) {
    const knownPageEstimate = this.estimatedPagesBySpineIndex.get(spineIndex);
    if (knownPageEstimate !== undefined) {
      return knownPageEstimate;
    }

    return this.getNormalizedSpineSize(spineIndex) * fallbackPagesPerSpineUnit;
  }

  private recordPageEstimate(slot: SpineSlot) {
    const coveredSpineCount = Math.max(1, slot.renderedSpineCount);
    const totalSize = this.getNormalizedSpineRangeSize(slot.leadingSpineIndex, coveredSpineCount);
    if (totalSize <= 0) return;

    const pagesPerSpineUnit = Math.max(1, slot.totalPages) / totalSize;
    for (
      let spineIndex = slot.leadingSpineIndex;
      spineIndex < slot.leadingSpineIndex + coveredSpineCount && spineIndex < this.package.spine.length;
      spineIndex += 1
    ) {
      this.estimatedPagesBySpineIndex.set(spineIndex, this.getNormalizedSpineSize(spineIndex) * pagesPerSpineUnit);
    }
    this.estimatedPagination = null;
  }

  private invalidatePageNumberEstimates() {
    this.estimatedPagesBySpineIndex.clear();
    this.estimatedPagination = null;
  }

  private invalidatePaginationIndex() {
    this.exactPaginationIndex = null;
    this.exactPaginationIndexPromise = null;
    this.paginationIndexVersion += 1;
    if (!this.isDestroyed) {
      this.onPaginationIndexInvalidated?.();
    }
  }

  private async ensureExactPaginationIndex() {
    if (this.isDestroyed) return;
    if (this.exactPaginationIndex) return;
    if (this.exactPaginationIndexPromise) {
      await this.exactPaginationIndexPromise;
      return;
    }

    const version = this.paginationIndexVersion;
    const promise = this.buildExactPaginationIndex(version).finally(() => {
      if (this.exactPaginationIndexPromise === promise) {
        this.exactPaginationIndexPromise = null;
      }
    });
    this.exactPaginationIndexPromise = promise;
    await promise;
  }

  private async buildExactPaginationIndex(version: number) {
    const units: PaginationIndexUnit[] = [];
    let pageStart = 0;
    let leadingSpineIndex = 0;
    const spineTotal = this.package.spine.length;

    while (!this.isDestroyed && leadingSpineIndex < spineTotal && version === this.paginationIndexVersion) {
      await this.yieldToIdle();
      const slot = await this.ensureSlot(leadingSpineIndex);
      const pageCount = Math.max(1, slot.totalPages);
      const renderedSpineCount = Math.max(1, slot.renderedSpineCount);

      units.push({
        leadingSpineIndex,
        renderedSpineCount,
        pageCount,
        pageStart,
      });

      pageStart += pageCount;
      leadingSpineIndex += renderedSpineCount;
    }

    if (this.isDestroyed || version !== this.paginationIndexVersion) return;

    this.publishExactPaginationIndex({
      units,
      totalPages: Math.max(1, pageStart),
    });
  }

  private publishExactPaginationIndex(index: PaginationIndexSnapshot) {
    this.exactPaginationIndex = this.clonePaginationIndex(index);

    const snapshot = this.getExactPaginationIndexSnapshot();
    if (snapshot) {
      this.onPaginationIndexReady?.(snapshot);
    }

    this.notifyRelocated(false);
    if (this.pendingPercentageSeek !== null) {
      void this.flushPendingPercentageSeek();
    }
  }

  private clonePaginationIndex(index: PaginationIndexSnapshot): PaginationIndexSnapshot {
    return {
      totalPages: index.totalPages,
      units: index.units.map((unit) => ({ ...unit })),
    };
  }

  private isValidPaginationIndex(index: PaginationIndexSnapshot) {
    if (!Number.isFinite(index.totalPages) || index.totalPages < 1 || index.units.length === 0) return false;

    let pageStart = 0;
    let previousLeadingIndex = -1;
    for (const unit of index.units) {
      if (
        !Number.isInteger(unit.leadingSpineIndex) ||
        !Number.isInteger(unit.renderedSpineCount) ||
        !Number.isInteger(unit.pageCount) ||
        !Number.isInteger(unit.pageStart)
      ) {
        return false;
      }

      if (
        unit.leadingSpineIndex <= previousLeadingIndex ||
        unit.leadingSpineIndex < 0 ||
        unit.leadingSpineIndex >= this.package.spine.length ||
        unit.renderedSpineCount < 1 ||
        unit.pageCount < 1 ||
        unit.pageStart !== pageStart
      ) {
        return false;
      }

      previousLeadingIndex = unit.leadingSpineIndex;
      pageStart += unit.pageCount;
    }

    return Math.max(1, pageStart) === index.totalPages;
  }

  private getExactGlobalPageIndexForPercentage(percentage: number, index: PaginationIndexSnapshot) {
    const clamped = Math.max(0, Math.min(100, percentage));
    return Math.round((clamped / 100) * Math.max(index.totalPages - 1, 0));
  }

  private getExactPageTargetForPercentage(percentage: number) {
    const index = this.exactPaginationIndex;
    if (!index) {
      throw new Error("Exact pagination index is not ready");
    }

    const globalPageIndex = this.getExactGlobalPageIndexForPercentage(percentage, index);
    let low = 0;
    let high = index.units.length - 1;
    let unit = index.units[0]!;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = index.units[mid]!;
      const unitEnd = candidate.pageStart + candidate.pageCount;

      if (globalPageIndex < candidate.pageStart) {
        high = mid - 1;
      } else if (globalPageIndex >= unitEnd) {
        low = mid + 1;
      } else {
        unit = candidate;
        break;
      }
    }

    return {
      leadingSpineIndex: unit.leadingSpineIndex,
      pageIndex: Math.max(0, Math.min(unit.pageCount - 1, globalPageIndex - unit.pageStart)),
    };
  }

  private async getEstimatedPageTargetForPercentage(percentage: number) {
    const pagination = this.getEstimatedPagination();
    const clamped = Math.max(0, Math.min(100, percentage));
    const globalPageIndex = (clamped / 100) * Math.max(pagination.totalPages - 1, 0);
    let spineIndex = 0;

    for (let index = 0; index < pagination.pageStarts.length; index += 1) {
      const pageStart = pagination.pageStarts[index] ?? 0;
      const pageEnd = pageStart + (pagination.pageCounts[index] ?? 1);
      if (globalPageIndex >= pageStart && globalPageIndex < pageEnd) {
        spineIndex = index;
        break;
      }
      if (globalPageIndex >= pageEnd) {
        spineIndex = index;
      }
    }

    const leadingSpineIndex = await this.getLeadingIndexForSpine(spineIndex);
    const pageStart = pagination.pageStarts[spineIndex] ?? 0;
    const pageCount = Math.max(1, pagination.pageCounts[spineIndex] ?? 1);
    const pageRatio = Math.max(0, Math.min(1, (globalPageIndex - pageStart) / pageCount));
    const estimatedSlotPages = Math.max(1, Math.round(pageCount));

    return {
      leadingSpineIndex,
      pageIndex: Math.max(0, Math.min(estimatedSlotPages - 1, Math.round(pageRatio * (estimatedSlotPages - 1)))),
    };
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
    if (this.isDestroyed) {
      throw new Error("Renderer has been destroyed");
    }

    const existing = this.slots.get(leadingIndex);
    if (existing) {
      await existing.buildPromise;
      this.touchLru(leadingIndex);
      return existing;
    }
    return this.createSlot(leadingIndex);
  }

  private async createSlot(leadingIndex: number): Promise<SpineSlot> {
    if (this.isDestroyed) {
      throw new Error("Renderer has been destroyed");
    }

    const shadowHost = document.createElement("div");
    shadowHost.className = INACTIVE_HOST_CLASS;
    shadowHost.style.cssText =
      "position: absolute; inset: 0; width: 100%; height: 100%; visibility: hidden; pointer-events: none;";
    this.options.container.appendChild(shadowHost);
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });

    const contentElement = document.createElement("div");
    contentElement.className = "epub-content";
    contentElement.style.transition = "none";
    contentElement.style.willChange = "transform";
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
    if (this.isDestroyed) return;

    const { attributes, leadingMergedColumnCount, processedHtml, renderedSpineCount } = await this.buildRenderableSpine(
      slot.leadingSpineIndex,
    );
    if (this.isDestroyed || !slot.shadowHost.isConnected) return;

    slot.renderedSpineCount = renderedSpineCount;
    slot.leadingMergedColumnCount = leadingMergedColumnCount;

    this.renderIntoSlot(slot, processedHtml, attributes);
    await this.yieldToMain();
    let sliceStartedAt = performance.now();
    await this.epubStyler.snapMarginsToGridCooperative(
      slot.contentElement,
      this.options.fontSize,
      this.options,
      () => performance.now() - sliceStartedAt >= PAGINATION_FRAME_BUDGET_MS,
      async () => {
        await this.yieldToMain();
        sliceStartedAt = performance.now();
      },
    );
    await this.waitResourcesReady(slot.contentElement);
    if (this.isDestroyed || !slot.shadowHost.isConnected) return;
    await this.yieldToMain();
    void slot.contentElement.offsetWidth;
    slot.totalPages = await this.measurePages(slot);
    this.recordPageEstimate(slot);
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
    slot.contentElement.style.transition = this.shouldAnimatePageTurn(internal) ? PAGE_TURN_TRANSITION : "none";
    slot.contentElement.style.transform = `translateX(${translateX}px)`;
    if (!internal) {
      this.notifyRelocated(true);
    }
    this.scheduleStableResizeAnchorUpdate(internal);
  }

  private shouldAnimatePageTurn(internal: boolean) {
    return !internal && !this.reducedMotionQuery.matches;
  }

  private async measurePages(slot: SpineSlot): Promise<number> {
    const { pageStride, margin } = this.getPaginationMetrics(slot.contentElement);
    const contentRect = slot.contentElement.getBoundingClientRect();
    let maxRight = margin;
    let sliceStartedAt = performance.now();

    const updateMaxRight = (rect: DOMRect) => {
      if (rect.width === 0 || rect.height === 0) return;
      maxRight = Math.max(maxRight, rect.right - contentRect.left);
    };

    const yieldIfNeeded = async () => {
      if (performance.now() - sliceStartedAt < PAGINATION_FRAME_BUDGET_MS) return;
      await this.yieldToMain();
      sliceStartedAt = performance.now();
    };

    const elements = Array.from(
      slot.contentElement.querySelectorAll<HTMLElement>(
        "p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, img, svg, hr",
      ),
    );

    for (const element of elements) {
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

        await yieldIfNeeded();
      }

      if (foundText) {
        await yieldIfNeeded();
        continue;
      }

      for (const rect of Array.from(element.getClientRects())) {
        updateMaxRight(rect);
      }

      await yieldIfNeeded();
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

  private async getLeadingIndexForSpine(spineIndex: number) {
    if (spineIndex > 0 && (await this.shouldMergeWithFollowingSpine(spineIndex - 1))) {
      return spineIndex - 1;
    }
    return spineIndex;
  }

  private getElementForCfi(slot: SpineSlot, spineIndex: number, path: string) {
    if (spineIndex === slot.leadingSpineIndex && slot.renderedSpineCount > 1) {
      const leadingSpine = slot.contentElement.querySelector(".epub-leading-spine-sparse");
      return leadingSpine
        ? CFIHelper.getElementByPath(leadingSpine, path)
        : CFIHelper.getElementByPath(slot.contentElement, path);
    }

    if (spineIndex === slot.leadingSpineIndex + 1 && slot.renderedSpineCount > 1) {
      const followingSpine = slot.contentElement.querySelector(".epub-following-spine");
      return followingSpine ? CFIHelper.getElementByPath(followingSpine, path) : null;
    }

    return CFIHelper.getElementByPath(slot.contentElement, path);
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
      bodyHtml = `<div class="epub-leading-spine-sparse">${bodyHtml}</div>`;

      const nextHtmlContent = await this.parser.getFileAsText(this.parser.resolvePath(nextManifestItem.href));
      const nextDoc = this.parser.parseMarkup(nextHtmlContent, nextManifestItem.mediaType);

      await this.resourceResolver.resolveImages(nextDoc, nextManifestItem.href);
      this.resourceResolver.resolveLinks(nextDoc);

      combinedStyles += await this.epubStyler.resolveCombinedStyles(nextDoc, nextManifestItem.href);
      bodyHtml += `<div class="epub-following-spine epub-following-spine-opening">${this.parser.serializeBodyInnerHtml(
        nextDoc,
      )}</div>`;
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

    await this.withTimeout(Promise.all(promises), RESOURCE_READY_TIMEOUT_MS);
  }

  async handleResize() {
    if (this.isBusy) {
      this.hasPendingResize = true;
      return;
    }
    if (!this.activeSlot) return;

    const previousSlot = this.activeSlot;
    const previousLeadingIndex = previousSlot.leadingSpineIndex;
    const previousPage = this.currentPage;
    const previousPageRatio = previousSlot.totalPages > 1 ? previousPage / Math.max(previousSlot.totalPages - 1, 1) : 0;

    this.isBusy = true;
    this.hasPendingResize = false;
    this.beginForegroundWork("Repaginating");

    try {
      await this.yieldToMain();
      const parsedAnchor = this.stableResizeCfi ? CFIHelper.parse(this.stableResizeCfi) : null;
      const targetLeadingIndex = parsedAnchor
        ? await this.getLeadingIndexForSpine(parsedAnchor.spineIndex)
        : await this.getLeadingIndexForSpine(previousLeadingIndex);

      this.invalidatePaginationIndex();
      this.invalidatePageNumberEstimates();
      this.destroyAllSlots();

      if (this.stableResizeCfi) {
        await this.displayCFI(this.stableResizeCfi, true);
      } else {
        const slot = await this.activateLeadingIndex(targetLeadingIndex, 0);
        const targetPage = Math.round(previousPageRatio * Math.max(slot.totalPages - 1, 0));
        this.goToPage(this.normalizePageForLayout(targetPage), true);
      }
    } finally {
      this.isBusy = false;
      this.endForegroundWork();
      this.notifyRelocated(false);
      this.schedulePrefetchNeighbors();
      this.flushPendingResize();
    }
  }

  private flushPendingResize() {
    if (!this.hasPendingResize || this.isBusy || !this.activeSlot || this.isDestroyed) return;
    void this.handleResize();
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

    if (loc?.start?.displayed && slot && this.exactPaginationIndex) {
      const unit = this.exactPaginationIndex.units.find((unit) => unit.leadingSpineIndex === slot.leadingSpineIndex);
      if (unit) {
        const globalPageIndex = Math.max(
          0,
          Math.min(this.exactPaginationIndex.totalPages - 1, unit.pageStart + this.currentPage),
        );
        loc.start.displayed.percentage =
          this.exactPaginationIndex.totalPages > 1
            ? (globalPageIndex / (this.exactPaginationIndex.totalPages - 1)) * 100
            : 0;
      }
    } else if (loc?.start?.displayed && slot) {
      const estimatedPagination = this.getEstimatedPagination();
      const pageStart = estimatedPagination.pageStarts[slot.leadingSpineIndex];
      if (pageStart !== undefined) {
        const globalPageIndex = Math.max(0, Math.min(estimatedPagination.totalPages - 1, pageStart + this.currentPage));
        const estimatedPercentage =
          estimatedPagination.totalPages > 1 ? (globalPageIndex / (estimatedPagination.totalPages - 1)) * 100 : 0;
        loc.start.displayed.percentage = Math.max(loc.start.displayed.percentage, estimatedPercentage);
      }
    }

    return loc;
  }

  private notifyRelocated(basic: boolean = false) {
    if (this.isBusy) return;
    if (this.onRelocated) {
      const loc = this.getCurrentLocation(basic);
      this.onRelocated(loc);
    }
  }

  private scheduleStableResizeAnchorUpdate(internal: boolean) {
    if (this.stableResizeAnchorTimer !== undefined) {
      clearTimeout(this.stableResizeAnchorTimer);
    }

    const slot = this.activeSlot;
    const page = this.currentPage;
    const delay = this.shouldAnimatePageTurn(internal) ? 260 : 0;

    this.stableResizeAnchorTimer = setTimeout(() => {
      this.stableResizeAnchorTimer = undefined;
      if (this.isDestroyed || this.activeSlot !== slot || this.currentPage !== page) return;
      this.stableResizeCfi = this.getVisualResizeAnchorCfi(slot);
    }, delay);
  }

  private getVisualResizeAnchorCfi(slot: SpineSlot | null) {
    if (!slot) return undefined;

    const viewerRect = this.options.container.getBoundingClientRect();
    const midpoint = viewerRect.left + viewerRect.width / 2;
    const preferRightColumn = this.isTwoColumnLayout();
    const candidates: Array<{
      element: HTMLElement;
      rect: DOMRect;
      root: HTMLElement;
      spineIndex: number;
    }> = [];

    for (const element of Array.from(
      slot.contentElement.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, p, li, blockquote, img"),
    )) {
      for (const rect of Array.from(element.getClientRects())) {
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.right <= viewerRect.left || rect.left >= viewerRect.right) continue;
        if (rect.bottom <= viewerRect.top || rect.top >= viewerRect.bottom) continue;

        const target = this.getCfiRootForElement(slot, element);
        if (!target) continue;

        candidates.push({
          element,
          rect,
          root: target.root,
          spineIndex: target.spineIndex,
        });
      }
    }

    const columnCandidates = preferRightColumn
      ? candidates.filter((candidate) => candidate.rect.left >= midpoint || candidate.rect.right > midpoint)
      : candidates;
    const visibleCandidates = columnCandidates.length > 0 ? columnCandidates : candidates;
    visibleCandidates.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

    const anchor = visibleCandidates[0];
    if (!anchor) return undefined;

    const offset = this.getFirstVisibleTextOffset(anchor.element, viewerRect, preferRightColumn ? midpoint : undefined);
    return CFIHelper.generate(anchor.spineIndex, anchor.element, anchor.root, offset);
  }

  private getCfiRootForElement(slot: SpineSlot, element: HTMLElement) {
    if (slot.renderedSpineCount > 1) {
      const leadingSpine = slot.contentElement.querySelector<HTMLElement>(".epub-leading-spine-sparse");
      if (leadingSpine?.contains(element)) {
        return { root: leadingSpine, spineIndex: slot.leadingSpineIndex };
      }

      const followingSpine = slot.contentElement.querySelector<HTMLElement>(".epub-following-spine");
      if (followingSpine?.contains(element)) {
        return { root: followingSpine, spineIndex: slot.leadingSpineIndex + 1 };
      }
    }

    return { root: slot.contentElement, spineIndex: slot.leadingSpineIndex };
  }

  private getFirstVisibleTextOffset(element: HTMLElement, viewerRect: DOMRect, minLeft?: number) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let cumulativeOffset = 0;
    let node: Node | null;

    while ((node = walker.nextNode())) {
      const textNode = node as Text;
      const textLength = textNode.length;

      for (let offset = 0; offset < textLength; offset += 1) {
        const range = document.createRange();
        range.setStart(textNode, offset);
        range.setEnd(textNode, Math.min(textLength, offset + 1));
        const rect = range.getBoundingClientRect();

        if (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > viewerRect.left &&
          rect.left < viewerRect.right &&
          rect.bottom > viewerRect.top &&
          rect.top < viewerRect.bottom &&
          (minLeft === undefined || rect.right > minLeft)
        ) {
          return cumulativeOffset + offset;
        }
      }

      cumulativeOffset += textLength;
    }

    return 0;
  }

  private beginForegroundWork(label: string) {
    this.foregroundWorkDepth += 1;
    this.onBusy?.({ active: true, label });
  }

  private endForegroundWork() {
    this.foregroundWorkDepth = Math.max(0, this.foregroundWorkDepth - 1);
    if (this.foregroundWorkDepth === 0) {
      this.onBusy?.({ active: false });
    }
  }

  private async yieldToMain() {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
  }

  private async yieldToIdle() {
    const requestIdle = (
      globalThis as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      }
    ).requestIdleCallback;

    await new Promise<void>((resolve) => {
      if (typeof requestIdle === "function") {
        requestIdle(resolve, { timeout: 250 });
      } else {
        window.setTimeout(resolve, 16);
      }
    });
  }

  private async waitUntilForegroundIdle() {
    while (this.isBusy && !this.isDestroyed) {
      await this.yieldToIdle();
    }
  }

  private hashString(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, timeoutMs);
        }),
      ]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }

  updateSettings(options: Partial<RendererOptions>) {
    if (this.isBusy) return;
    const nextOptions = { ...this.options, ...options };
    const paginationChanged =
      nextOptions.fontSize !== this.options.fontSize ||
      nextOptions.fontFamily !== this.options.fontFamily ||
      nextOptions.margin !== this.options.margin;

    this.options = nextOptions;

    if (paginationChanged) {
      this.handleResize();
      return;
    }

    for (const slot of this.slots.values()) {
      this.epubStyler.applyStyles(slot.contentElement, slot.shadowRoot, this.options, true);
    }
    this.notifyRelocated(false);
  }

  destroy() {
    this.isDestroyed = true;
    this.resizeObserver.disconnect();
    this.resourceResolver.destroy();
    this.prefetchToken++;
    if (this.stableResizeAnchorTimer !== undefined) {
      clearTimeout(this.stableResizeAnchorTimer);
      this.stableResizeAnchorTimer = undefined;
    }
    if (this.pendingPercentageSeekTimer !== undefined) {
      clearTimeout(this.pendingPercentageSeekTimer);
      this.pendingPercentageSeekTimer = undefined;
    }
    this.invalidatePaginationIndex();
    this.destroyAllSlots();
    this.onBusy = undefined;
    this.onRelocated = undefined;
    this.onPaginationIndexReady = undefined;
    this.onPaginationIndexInvalidated = undefined;
  }
}
