import { useParams } from "@solidjs/router";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import { Header, HeaderButton } from "ui/Header";
import { BackIcon, BookOpenIcon } from "ui/Icons";
import { Modal, ModalPage, ModalSelect, ModalSlider, ModalToggle } from "ui/Modal";
import { db } from "../db";
import type { EpubManifestItem, EpubPackage } from "../lib/epub";
import { EpubParser, EpubRenderer } from "../lib/epub";
import { PaginationMapCache } from "../lib/epub/pagination-map-cache";
import { isSyncEnabled, syncBook } from "../services/sync";
import type { Theme } from "../store/settings";
import { settings, THEMES, updateSettings } from "../store/settings";

type ContentEntry = {
  label: string;
  startPercentage: number;
};

const TAP_MOVE_THRESHOLD = 10;
const TAP_DURATION_THRESHOLD = 500;
const SWIPE_MOVE_THRESHOLD = 50;
const SIDE_TAP_ZONE_RATIO = 0.28;
const FOOTER_MARGIN_OFFSET = 16;

const Reader = (props: { onClose: () => void }) => {
  const params = useParams<{ id: string }>();
  const bookId = () => parseInt(params.id, 10);

  let viewerRef: HTMLDivElement | undefined;
  let rendererRef: EpubRenderer | undefined;
  let paginationMapCache: PaginationMapCache | undefined;
  let isDisposed = false;
  let loadContentEntries: (() => Promise<void>) | null = null;
  let contentEntriesPromise: Promise<void> | null = null;
  let contentEntriesIdleHandle: number | null = null;

  const [renderer, setRenderer] = createSignal<EpubRenderer | undefined>(undefined);
  const [showControls, setShowControls] = createSignal(false);
  const [showSettings, setShowSettings] = createSignal(false);
  const [showContents, setShowContents] = createSignal(false);
  const [contentEntries, setContentEntries] = createSignal<ContentEntry[]>([]);
  const [contentsSliderValue, setContentsSliderValue] = createSignal(0);
  const [rendererBusy, setRendererBusy] = createSignal<{ active: boolean; label?: string }>({ active: false });
  const [progress, setProgress] = createSignal<{
    current: number;
    total: number;
    percentage?: number;
  } | null>(null);

  let pendingLocation: string | undefined;
  let allowSave = false;
  let wakeLock: WakeLockSentinel | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let readerGesture: {
    pointerId: number;
    startX: number;
    startY: number;
    startTime: number;
    pointerType: string;
  } | null = null;

  const getNormalizedSpineSize = (size: number | undefined) => Math.max(size || 0, 1);

  const decodeFragment = (fragment: string | undefined) => {
    if (!fragment) return null;
    try {
      return decodeURIComponent(fragment);
    } catch {
      return fragment;
    }
  };

  const resolveBookTarget = (path: string, opfPath: string) => {
    const [pathPart, fragmentPart] = path.split("#");
    const withoutFragment = pathPart?.split("?")[0] || "";
    if (!withoutFragment) {
      return {
        fragment: decodeFragment(fragmentPart),
        normalizedPath: "",
      };
    }

    const opfDir = opfPath.slice(0, opfPath.lastIndexOf("/") + 1);
    const normalized = new URL(withoutFragment, `https://book.local/${opfDir}`).pathname;
    return {
      fragment: decodeFragment(fragmentPart),
      normalizedPath: normalized.replace(/^\//, ""),
    };
  };

  const getSpineStartPercentages = (packageData: EpubPackage) => {
    const spineSizes = packageData.spine.map((item) => getNormalizedSpineSize(item.size));
    const totalBookSize = spineSizes.reduce((sum, size) => sum + size, 0);

    if (totalBookSize <= 0) {
      return {
        spineSizes,
        spineStarts: packageData.spine.map((_, index) => (index / Math.max(packageData.spine.length, 1)) * 100),
        totalBookSize: 1,
      };
    }

    let cumulativeSize = 0;
    const spineStarts = spineSizes.map((size) => {
      const start = (cumulativeSize / totalBookSize) * 100;
      cumulativeSize += size;
      return start;
    });

    return {
      spineSizes,
      spineStarts,
      totalBookSize,
    };
  };

  const flattenToc = (toc: EpubPackage["toc"]): Array<{ label: string; content: string }> => {
    const out: Array<{ label: string; content: string }> = [];
    const walk = (nodes: EpubPackage["toc"]) => {
      for (const node of nodes) {
        if (node.label && node.content) {
          out.push({ label: node.label, content: node.content });
        }
        if (node.children?.length) {
          walk(node.children);
        }
      }
    };

    walk(toc);
    return out;
  };

  const getFragmentProgressInDocument = (doc: Document, fragment: string | null) => {
    if (!fragment) return 0;

    const body = doc.querySelector("body");
    if (!body) return 0;

    const target =
      doc.getElementById(fragment) ??
      doc.querySelector(`[name="${fragment.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`);
    if (!target || target === body) return 0;

    const totalTextLength = body.textContent?.length ?? 0;
    if (totalTextLength <= 0) {
      const elements = Array.from(body.querySelectorAll("*"));
      const targetIndex = elements.indexOf(target);
      if (targetIndex <= 0) return 0;
      return targetIndex / Math.max(elements.length - 1, 1);
    }

    try {
      const range = doc.createRange();
      range.setStart(body, 0);
      range.setEndBefore(target);
      return Math.max(0, Math.min(range.toString().length / totalTextLength, 1));
    } catch {
      return 0;
    }
  };

  const buildFallbackContentEntries = (packageData: EpubPackage): ContentEntry[] => {
    const { spineStarts } = getSpineStartPercentages(packageData);

    return packageData.spine.map((_, spineIndex) => ({
      label: `Chapter ${spineIndex + 1}`,
      startPercentage: spineStarts[spineIndex] || 0,
    }));
  };

  const buildContentEntries = async (parser: EpubParser, packageData: EpubPackage): Promise<ContentEntry[]> => {
    if (packageData.spine.length === 0) return [];

    const spinePathToIndex = new Map<string, number>();
    const manifestItemsBySpineIndex = new Map<number, EpubManifestItem>();
    packageData.spine.forEach((spineItem, index) => {
      const manifestItem = packageData.manifest.get(spineItem.idref);
      if (!manifestItem) return;
      manifestItemsBySpineIndex.set(index, manifestItem);

      const { normalizedPath } = resolveBookTarget(manifestItem.href, packageData.opfPath);
      if (normalizedPath) {
        spinePathToIndex.set(normalizedPath, index);
      }
    });

    const { spineSizes, spineStarts, totalBookSize } = getSpineStartPercentages(packageData);
    const documentCache = new Map<number, Promise<Document | null>>();
    const getSpineDocument = (spineIndex: number) => {
      const cached = documentCache.get(spineIndex);
      if (cached) return cached;

      const manifestItem = manifestItemsBySpineIndex.get(spineIndex);
      const promise = (async () => {
        if (!manifestItem) return null;
        const htmlContent = await parser.getFileAsText(parser.resolvePath(manifestItem.href));
        return parser.parseMarkup(htmlContent, manifestItem.mediaType);
      })();

      documentCache.set(spineIndex, promise);
      return promise;
    };

    const chapterAnchors = (
      await Promise.all(
        flattenToc(packageData.toc).map(async (entry, order) => {
          const { fragment, normalizedPath } = resolveBookTarget(entry.content, packageData.opfPath);
          const spineIndex = spinePathToIndex.get(normalizedPath);
          const manifestItem = spineIndex !== undefined ? manifestItemsBySpineIndex.get(spineIndex) : undefined;

          if (spineIndex === undefined || !manifestItem) return null;

          const doc = fragment ? await getSpineDocument(spineIndex) : null;
          const fragmentProgress = doc ? getFragmentProgressInDocument(doc, fragment) : 0;
          const startPercentage =
            (spineStarts[spineIndex] || 0) + ((fragmentProgress * (spineSizes[spineIndex] || 0)) / totalBookSize) * 100;

          return {
            label: entry.label.trim() || `Chapter ${spineIndex + 1}`,
            order,
            startPercentage: Math.max(0, Math.min(100, startPercentage)),
          };
        }),
      )
    )
      .filter((entry): entry is { label: string; order: number; startPercentage: number } => entry !== null)
      .sort((a, b) =>
        a.startPercentage === b.startPercentage ? a.order - b.order : a.startPercentage - b.startPercentage,
      );

    if (chapterAnchors.length === 0) {
      return buildFallbackContentEntries(packageData);
    }

    const entries: ContentEntry[] = chapterAnchors.map((entry) => ({
      label: entry.label,
      startPercentage: entry.startPercentage,
    }));

    if (entries[0] && entries[0].startPercentage > 0) {
      entries.unshift({
        label: entries[0].label,
        startPercentage: 0,
      });
    } else if (entries[0]) {
      entries[0] = {
        ...entries[0],
        startPercentage: 0,
      };
    }

    return entries.filter((entry, index) => {
      const previous = entries[index - 1];
      return !previous || previous.label !== entry.label || previous.startPercentage !== entry.startPercentage;
    });
  };

  const getContentEntryForPercentage = (percentage: number) => {
    const entries = contentEntries();
    if (entries.length === 0) return null;

    const clamped = Math.max(0, Math.min(100, percentage));
    let low = 0;
    let high = entries.length - 1;
    let bestMatch = entries[0]!;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const entry = entries[mid]!;

      if (entry.startPercentage <= clamped) {
        bestMatch = entry;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return bestMatch;
  };

  const currentContentsDisplayValue = () => {
    const entry = getContentEntryForPercentage(contentsSliderValue());
    return entry?.label ?? "";
  };

  // --- Helpers ---

  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLock = await (
          navigator as unknown as {
            wakeLock: { request: (type: string) => Promise<WakeLockSentinel> };
          }
        ).wakeLock.request("screen");
      }
    } catch (err) {
      console.error("[Reader] Wake Lock error:", err);
    }
  };

  const handleVisibilityChange = async () => {
    if (wakeLock !== null && document.visibilityState === "visible") {
      await requestWakeLock();
    }
  };

  const cancelScheduledContentEntriesLoad = () => {
    if (contentEntriesIdleHandle === null) return;

    const cancelIdle = (
      globalThis as unknown as {
        cancelIdleCallback?: (id: number) => void;
      }
    ).cancelIdleCallback;

    if (typeof cancelIdle === "function") {
      cancelIdle(contentEntriesIdleHandle);
    } else {
      clearTimeout(contentEntriesIdleHandle);
    }

    contentEntriesIdleHandle = null;
  };

  const ensureContentEntriesLoaded = (immediate: boolean = false) => {
    if (contentEntries().length > 0) return Promise.resolve();
    if (contentEntriesPromise) return contentEntriesPromise;
    if (!loadContentEntries) return Promise.resolve();

    const startLoading = () => {
      if (!loadContentEntries) return Promise.resolve();
      const promise = loadContentEntries().finally(() => {
        contentEntriesPromise = null;
      });
      contentEntriesPromise = promise;
      return promise;
    };

    if (immediate) {
      cancelScheduledContentEntriesLoad();
      return startLoading();
    }

    if (contentEntriesIdleHandle !== null) return Promise.resolve();

    const requestIdle = (
      globalThis as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      }
    ).requestIdleCallback;

    if (typeof requestIdle === "function") {
      contentEntriesIdleHandle = requestIdle(
        () => {
          contentEntriesIdleHandle = null;
          void startLoading();
        },
        { timeout: 1000 },
      );
    } else {
      contentEntriesIdleHandle = window.setTimeout(() => {
        contentEntriesIdleHandle = null;
        void startLoading();
      }, 150);
    }

    return Promise.resolve();
  };

  const saveProgress = () => {
    if (!allowSave) return;
    if (pendingLocation) {
      const nextProgress = pendingLocation;
      void db.books
        .update(bookId(), { progress: nextProgress, syncUpdatedAt: Date.now() })
        .then(() => syncBook(bookId()))
        .catch((error) => console.error("Error saving reading progress:", error));
      pendingLocation = undefined;
    }
  };

  const getEffectiveTheme = (theme: Theme): "light" | "dark" => {
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return theme as "light" | "dark";
  };

  const updateProgressUI = (location: {
    start?: {
      cfi?: string;
      displayed?: {
        page: number;
        total: number;
        percentage: number;
        spineIndex: number;
      };
    };
    basic?: boolean;
  }) => {
    if (location?.start?.displayed) {
      const d = location.start.displayed;
      setProgress({
        current: d.page,
        total: d.total,
        percentage: parseFloat(d.percentage.toFixed(2)),
      });
      setContentsSliderValue(d.percentage);
    }
  };

  const commitContentsSeek = (percentage: number) => {
    const clamped = Math.max(0, Math.min(100, percentage));
    allowSave = true;
    renderer()?.seekToPercentage(clamped);
  };

  const getReaderSelectionText = () => {
    let selectionText = window.getSelection()?.toString() ?? "";

    for (const host of Array.from(viewerRef?.children ?? [])) {
      const shadowRoot = host.shadowRoot as (ShadowRoot & { getSelection?: () => Selection | null }) | null;
      selectionText += shadowRoot?.getSelection?.()?.toString() ?? "";
    }

    return selectionText.trim();
  };

  const hasReaderSelection = () => getReaderSelectionText().length > 0;

  const getEventPath = (e: Event) => e.composedPath().filter((target): target is Element => target instanceof Element);

  const isReaderSurfaceEvent = (e: Event) => {
    const path = getEventPath(e);
    return path.some(
      (target) =>
        target === viewerRef ||
        target.classList.contains("modal-overlay") ||
        target.classList.contains("modal-positioner"),
    );
  };

  const isReaderControlEvent = (e: Event) => {
    const path = getEventPath(e);
    return path.some(
      (target) =>
        target.closest(
          "button, a, input, select, textarea, [role='button'], .header-wrapper, .reader-seek-button, .modal-content",
        ) !== null,
    );
  };

  const dismissReaderUi = () => {
    setShowControls(false);
    setShowSettings(false);
    setShowContents(false);
  };

  const turnPage = (direction: "prev" | "next") => {
    const r = renderer();
    if (!r) return;

    allowSave = true;
    dismissReaderUi();
    const result = direction === "prev" ? r.prev() : r.next();
    void result;
  };

  const handleReaderTap = (e: PointerEvent) => {
    const xPercentage = e.clientX / window.innerWidth;

    if (xPercentage < SIDE_TAP_ZONE_RATIO) {
      turnPage("prev");
      return;
    }

    if (xPercentage > 1 - SIDE_TAP_ZONE_RATIO) {
      turnPage("next");
      return;
    }

    toggleControls();
  };

  const handleReaderPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary || !isReaderSurfaceEvent(e) || isReaderControlEvent(e)) {
      readerGesture = null;
      return;
    }

    readerGesture = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
      pointerType: e.pointerType,
    };
  };

  const handleReaderPointerUp = (e: PointerEvent) => {
    if (!readerGesture || readerGesture.pointerId !== e.pointerId || isReaderControlEvent(e)) {
      readerGesture = null;
      return;
    }

    const gesture = readerGesture;
    readerGesture = null;

    if (hasReaderSelection()) return;

    const deltaX = e.clientX - gesture.startX;
    const deltaY = e.clientY - gesture.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const elapsed = Date.now() - gesture.startTime;
    const isTap = absX < TAP_MOVE_THRESHOLD && absY < TAP_MOVE_THRESHOLD && elapsed < TAP_DURATION_THRESHOLD;
    const isSwipe =
      gesture.pointerType !== "mouse" && absX >= SWIPE_MOVE_THRESHOLD && absX > absY * 1.2 && elapsed < 1000;

    if (isSwipe) {
      e.preventDefault();
      e.stopPropagation();
      turnPage(deltaX < 0 ? "next" : "prev");
      return;
    }

    if (isTap) {
      e.preventDefault();
      e.stopPropagation();
      handleReaderTap(e);
    }
  };

  const handleReaderPointerCancel = () => {
    readerGesture = null;
  };

  // --- Lifecycle ---

  onCleanup(() => {
    isDisposed = true;

    // Persist last known location before unmount.
    saveProgress();

    document.documentElement.classList.remove("scroll-lock");

    window.removeEventListener("beforeunload", saveProgress);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.removeEventListener("pointerdown", handleReaderPointerDown, true);
    document.removeEventListener("pointerup", handleReaderPointerUp, true);
    document.removeEventListener("pointercancel", handleReaderPointerCancel, true);

    wakeLock?.release()?.then(() => {
      wakeLock = null;
    });

    document.onkeyup = null;

    if (debounceTimer) clearTimeout(debounceTimer);
    cancelScheduledContentEntriesLoad();
    paginationMapCache?.dispose();
    paginationMapCache = undefined;
    loadContentEntries = null;
    contentEntriesPromise = null;
    rendererRef?.destroy();
    rendererRef = undefined;
  });

  onMount(async () => {
    document.documentElement.classList.add("scroll-lock");
    try {
      if (isSyncEnabled()) {
        try {
          await syncBook(bookId());
        } catch (error) {
          console.error("Error syncing book before open:", error);
        }
      }

      const bookData = await db.books.get(bookId());
      if (!bookData || !viewerRef) {
        props.onClose();
        return;
      }

      const openedAt = Date.now();
      await db.books.update(bookId(), { lastOpened: openedAt, syncUpdatedAt: openedAt });
      void syncBook(bookId());

      const arrayBuffer =
        bookData.data instanceof ArrayBuffer ? bookData.data : await new Blob([bookData.data]).arrayBuffer();

      const parser = new EpubParser();
      const packageData = await parser.load(arrayBuffer);
      loadContentEntries = async () => {
        const entries = await buildContentEntries(parser, packageData);
        if (!isDisposed) {
          setContentEntries(entries);
        }
      };

      const renderer = new EpubRenderer(parser, packageData, {
        container: viewerRef,
        fontSize: settings().fontSize,
        fontFamily: settings().fontFamily,
        margin: settings().margin,
        theme: getEffectiveTheme(settings().theme),
        invertImages: settings().invertImages,
        pageTurnAnimations: settings().pageTurnAnimations,
      });

      renderer.setOnRelocated((location) => {
        updateProgressUI(location);

        if (location.basic) {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            const fullLoc = renderer.getCurrentLocation(false);
            if (fullLoc?.start?.cfi) {
              pendingLocation = fullLoc.start.cfi;
              if (allowSave) {
                const cfiFragment = `#${pendingLocation}`;
                if (window.location.hash !== cfiFragment) {
                  history.replaceState({}, "", cfiFragment);
                }
                saveProgress();
              }
            }
          }, 500);
          return;
        }

        if (location?.start?.cfi) {
          pendingLocation = location.start.cfi;

          if (allowSave) {
            const cfiFragment = `#${pendingLocation}`;
            if (window.location.hash !== cfiFragment) {
              history.replaceState({}, "", cfiFragment);
            }
            saveProgress();
          }
        }
      });
      renderer.setOnBusy(setRendererBusy);
      rendererRef = renderer;
      paginationMapCache = new PaginationMapCache({
        getBookId: bookId,
        getRenderer: () => rendererRef,
        onReady: () => {},
      });
      renderer.setOnPaginationIndexReady((snapshot) => {
        void paginationMapCache?.save(snapshot);
      });
      renderer.setOnPaginationIndexInvalidated(() => {
        paginationMapCache?.schedule();
      });

      setRenderer(renderer);

      // Determine initial location
      const hashLocation = window.location.hash.slice(1);
      let initialLocation: string | number | undefined;

      if (hashLocation?.startsWith("epubcfi(")) {
        initialLocation = hashLocation;
      } else if (typeof bookData.progress === "string" && bookData.progress) {
        initialLocation = bookData.progress;
      } else {
        initialLocation = 0;
      }

      await renderer.display(initialLocation);
      paginationMapCache.schedule(true);
      void ensureContentEntriesLoaded();
      document.addEventListener("pointerdown", handleReaderPointerDown, true);
      document.addEventListener("pointerup", handleReaderPointerUp, true);
      document.addEventListener("pointercancel", handleReaderPointerCancel, true);

      // Keyboard
      document.onkeyup = (e) => {
        if (e.key === "ArrowLeft") {
          allowSave = true;
          renderer.prev();
        }
        if (e.key === "ArrowRight") {
          allowSave = true;
          renderer.next();
        }
        if (e.key === "Escape") props.onClose();
      };
      window.addEventListener("beforeunload", saveProgress);

      // Wake Lock
      requestWakeLock();
      document.addEventListener("visibilitychange", handleVisibilityChange);
    } catch (e) {
      console.error(e);
      alert("Error loading book");
      props.onClose();
    }
  });

  // Reactive Settings Updates
  createEffect(() => {
    const r = renderer();
    if (!r) return;
    const s = settings();

    const effectiveTheme = getEffectiveTheme(s.theme);

    r.updateSettings({
      fontSize: s.fontSize,
      fontFamily: s.fontFamily,
      margin: s.margin,
      theme: effectiveTheme,
      invertImages: s.invertImages,
      pageTurnAnimations: s.pageTurnAnimations,
    });

    // Sync data-theme attribute for ui CSS
    document.documentElement.dataset.theme = s.theme;
  });

  // --- Actions ---

  const toggleControls = () => {
    setShowControls((c) => !c);
    if (showSettings()) setShowSettings(false);
    if (showContents()) setShowContents(false);
  };

  const openContents = (e: MouseEvent) => {
    e.stopPropagation();
    setShowSettings(false);
    setShowContents(true);
    void ensureContentEntriesLoaded(true);
  };

  const seekByContentsSlider = (percentage: number) => {
    const clamped = Math.max(0, Math.min(100, percentage));
    setContentsSliderValue(clamped);
  };

  return (
    <div class="reader-container">
      <div class="reader-viewer" ref={viewerRef} />

      <Show when={rendererBusy().active}>
        <div class="reader-loading-overlay" aria-live="polite" aria-busy="true">
          <div class="reader-loading-card">
            <span class="reader-loading-spinner" />
            <span>{rendererBusy().label ?? "Loading"}</span>
          </div>
        </div>
      </Show>

      {/* TODO: remove those hardcoded theme values */}
      <div class="reader-footer">
        <Show when={progress()}>
          <div
            class="page-indicator"
            style={{
              color: THEMES[getEffectiveTheme(settings().theme)].body.color,
              opacity: 0.5,
              transform: settings().margin > 0 ? `translateY(-${FOOTER_MARGIN_OFFSET}px)` : "none",
            }}
          >
            {progress()?.current} / {progress()?.total}
            {progress()?.percentage !== undefined && ` • ${progress()?.percentage?.toFixed(2)}%`}
          </div>
        </Show>
      </div>

      <div class={`reader-ui-layer ${showControls() ? "visible" : ""}`}>
        <div class="header-wrapper">
          <Header>
            <HeaderButton onClick={() => props.onClose()}>
              <BackIcon />
            </HeaderButton>
            <HeaderButton
              right
              onClick={() => {
                setShowContents(false);
                setShowSettings(true);
              }}
            >
              <span class="aa-icon">Aa</span>
            </HeaderButton>
          </Header>
        </div>

        <button class="reader-seek-button" onClick={openContents} aria-label="Open contents">
          <BookOpenIcon />
        </button>

        <Modal open={showSettings} setOpen={setShowSettings} title="Appearance" height="auto">
          <ModalPage id="root">
            <ModalSelect
              label="Theme"
              value={settings().theme}
              onChange={(val: string) => updateSettings({ theme: val as "light" | "dark" | "system" })}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </ModalSelect>

            <ModalSelect
              label="Font"
              value={settings().fontFamily}
              onChange={(val: string) => updateSettings({ fontFamily: val })}
            >
              <option value="Literata, Georgia, serif">Literata</option>
              <option value="Merriweather, Georgia, serif">Merriweather</option>
              <option value="'Open Sans', Helvetica, sans-serif">Open Sans</option>
              <option value="Georgia, serif">Georgia</option>
              <option value="Helvetica, sans-serif">Helvetica</option>
              <option value="'Courier New', monospace">Monospace</option>
            </ModalSelect>

            <ModalSelect
              label="Margin"
              value={settings().margin}
              onChange={(val: string) => updateSettings({ margin: parseInt(val, 10) })}
            >
              <option value="0">None</option>
              <option value="20">Normal</option>
              <option value="40">Wide</option>
            </ModalSelect>
            <ModalSlider
              label="Font Size"
              value={settings().fontSize}
              min={50}
              max={200}
              step={5}
              displayValue={`${settings().fontSize}%`}
              onChange={(val: number) => updateSettings({ fontSize: val })}
            />
            <ModalToggle
              label="Invert Images"
              checked={() => settings().invertImages}
              onChange={(val: boolean) => updateSettings({ invertImages: val })}
            />
            <ModalToggle
              label="Page Turn Animations"
              checked={() => settings().pageTurnAnimations}
              onChange={(val: boolean) => updateSettings({ pageTurnAnimations: val })}
            />
          </ModalPage>
        </Modal>

        <Modal open={showContents} setOpen={setShowContents} title="Contents" height="auto">
          <ModalPage id="root">
            <Show when={contentEntries().length > 0}>
              <ModalSlider
                label="Contents"
                value={contentsSliderValue()}
                min={0}
                max={100}
                step={0.1}
                displayValue={currentContentsDisplayValue()}
                onChange={seekByContentsSlider}
                onChangeEnd={commitContentsSeek}
              />
            </Show>
          </ModalPage>
        </Modal>
      </div>
    </div>
  );
};

export default Reader;
