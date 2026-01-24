import { useParams } from "@solidjs/router";
import { BackIcon, Header, HeaderButton, Modal, ModalPage, ModalSelect, ModalSlider, ModalToggle } from "rams";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import { db } from "../db";
import { useTap } from "../hooks/useTap";
import { EpubParser, EpubRenderer } from "../lib/epub";
import type { Theme } from "../store/settings";
import { settings, THEMES, updateSettings } from "../store/settings";

const Reader = (props: { onClose: () => void }) => {
  const params = useParams<{ id: string }>();
  const bookId = () => parseInt(params.id, 10);

  let viewerRef: HTMLDivElement | undefined;
  let rendererRef: EpubRenderer | undefined;

  const [renderer, setRenderer] = createSignal<EpubRenderer | undefined>(undefined);
  const [showControls, setShowControls] = createSignal(false);
  const [showSettings, setShowSettings] = createSignal(false);
  const [progress, setProgress] = createSignal<{
    current: number;
    total: number;
    percentage?: number;
  } | null>(null);

  let pendingLocation: string | undefined;
  let allowSave = false;
  let wakeLock: WakeLockSentinel | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

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

  const saveProgress = () => {
    if (!allowSave) return;
    if (pendingLocation) {
      db.books.update(bookId(), { progress: pendingLocation });
      pendingLocation = undefined;
    }
  };

  const getEffectiveTheme = (theme: Theme): "light" | "dark" => {
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return theme as "light" | "dark";
  };

  const updateProgressUI = (location: EpubLocation) => {
    if (location?.start?.displayed) {
      const d = location.start.displayed;
      setProgress({
        current: d.page,
        total: d.total,
        percentage: parseFloat(d.percentage.toFixed(2)),
      });
    }
  };

  // --- Lifecycle ---

  onCleanup(() => {
    // Persist last known location before unmount.
    saveProgress();

    document.documentElement.classList.remove("scroll-lock");

    window.removeEventListener("beforeunload", saveProgress);
    document.removeEventListener("visibilitychange", handleVisibilityChange);

    wakeLock?.release()?.then(() => {
      wakeLock = null;
    });

    document.onkeyup = null;

    if (debounceTimer) clearTimeout(debounceTimer);

    rendererRef?.destroy();
    rendererRef = undefined;
  });

  onMount(async () => {
    document.documentElement.classList.add("scroll-lock");
    try {
      const bookData = await db.books.get(bookId());
      if (!bookData || !viewerRef) {
        props.onClose();
        return;
      }

      // Update last opened timestamp
      db.books.update(bookId(), { lastOpened: Date.now() });

      const arrayBuffer =
        bookData.data instanceof ArrayBuffer ? bookData.data : await new Blob([bookData.data]).arrayBuffer();

      const parser = new EpubParser();
      const packageData = await parser.load(arrayBuffer);

      const renderer = new EpubRenderer(parser, packageData, {
        container: viewerRef,
        fontSize: settings().fontSize,
        fontFamily: settings().fontFamily,
        margin: settings().margin,
        theme: getEffectiveTheme(settings().theme),
        invertImages: settings().invertImages,
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

      rendererRef = renderer;
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
    });

    // Sync data-theme attribute for rams CSS
    document.documentElement.dataset.theme = s.theme;
  });

  // --- Actions ---

  const prev = (e: Event) => {
    e.stopPropagation();
    allowSave = true;
    renderer()?.prev();
  };
  const next = (e: Event) => {
    e.stopPropagation();
    allowSave = true;
    renderer()?.next();
  };

  const toggleControls = () => {
    setShowControls((c) => !c);
    if (showSettings()) setShowSettings(false);
  };

  const handleViewerClick = () => {
    if (showControls() && window.getSelection()?.toString().length === 0) {
      toggleControls();
    }
  };

  // --- Pointer/Tap Handling ---

  const leftTap = useTap((e) => (showControls() ? toggleControls() : prev(e)));
  const centerTap = useTap(toggleControls);
  const rightTap = useTap((e) => (showControls() ? toggleControls() : next(e)));

  return (
    <div class="reader-container">
      <div class="reader-viewer" ref={viewerRef} onClick={handleViewerClick} />

      <div class={`reader-controls-overlay ${showControls() ? "visible" : ""}`}>
        <div class="nav-zone left" {...leftTap} />
        <div class="nav-zone center" {...centerTap} />
        <div class="nav-zone right" {...rightTap} />
      </div>

      {/* TODO: remove those hardcoded theme values */}
      <div class="reader-footer">
        <Show when={progress()}>
          <div
            class="page-indicator"
            style={{
              color: THEMES[getEffectiveTheme(settings().theme)].body.color,
              opacity: 0.5,
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
                setShowSettings(true);
              }}
            >
              <span class="aa-icon">Aa</span>
            </HeaderButton>
          </Header>
        </div>

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
          </ModalPage>
        </Modal>
      </div>
    </div>
  );
};

export default Reader;
