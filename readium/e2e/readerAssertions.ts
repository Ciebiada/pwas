import { expect, type Page } from "@playwright/test";

export const READIUM_SETTINGS_KEY = "readium_settings";

export const waitForReaderContent = async (page: Page) => {
  await page.waitForFunction(() => {
    const host = document.querySelector(".epub-shadow-host");
    const shadowRoot = host?.shadowRoot;
    const content = shadowRoot?.querySelector(".epub-content");
    return Boolean(content?.textContent?.trim());
  });
};

export const setDarkTheme = async (page: Page) => {
  await page.addInitScript(
    ({ storeKey }) => {
      window.localStorage.setItem(
        storeKey,
        JSON.stringify({
          theme: "dark",
          fontSize: 100,
          margin: 20,
          fontFamily: "Literata, Georgia, serif",
          invertImages: false,
        }),
      );
    },
    { storeKey: READIUM_SETTINGS_KEY },
  );
};

export const uploadBook = async (page: Page, bookPath: string) => {
  const fileInput = page.locator("#file-input");
  await expect(fileInput).toHaveCount(1);
  await fileInput.setInputFiles(bookPath);
  await expect(page.locator(".book-item")).toHaveCount(1);
};

export const resetReaderPwaState = async (page: Page) => {
  await page.evaluate(async () => {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }
  });
};

export const openOnlyBook = async (page: Page) => {
  await page.locator(".book-item").click();
  await expect(page).toHaveURL(/\/book\/\d+(?:#.*)?$/);
  await waitForReaderContent(page);
};

export const goToChapterStart = async (page: Page, chapterTitle: string) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const hasChapterHeading = await page.evaluate((expectedTitle) => {
      const headings = Array.from(
        document.querySelector(".epub-shadow-host")?.shadowRoot?.querySelectorAll("h1, h2, h3") ?? [],
      );

      return headings.some((heading) => heading.textContent?.trim() === expectedTitle);
    }, chapterTitle);

    if (hasChapterHeading) return;

    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
  }

  throw new Error(`Failed to reach chapter heading: ${chapterTitle}`);
};

export type ChapterPageMetrics = {
  headingBackgroundColor: string;
  headingText: string | null;
  gridUnit: number;
  firstBodyLineTop: number;
  firstBodyLineOffset: number;
  distinctBodyLineOffsets: number[];
  visibleBodyLineTops: number[];
};

export const getChapterPageMetrics = async (page: Page): Promise<ChapterPageMetrics> =>
  await page.evaluate(() => {
    const viewer = document.querySelector(".reader-viewer");
    const shadowRoot = document.querySelector(".epub-shadow-host")?.shadowRoot;
    const content = shadowRoot?.querySelector<HTMLElement>(".epub-content");
    const heading = shadowRoot?.querySelector<HTMLElement>("h1");
    const body = content;

    if (!viewer || !shadowRoot || !content || !heading || !body) {
      throw new Error("Reader content is not ready");
    }

    const viewerRect = viewer.getBoundingClientRect();

    const collectLineTops = (selector: string) => {
      const tops: number[] = [];
      const elements = Array.from(shadowRoot.querySelectorAll<HTMLElement>(selector));

      for (const element of elements) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const textNode = walker.currentNode;
          if (!textNode.textContent?.trim()) continue;

          const range = document.createRange();
          range.selectNodeContents(textNode);

          for (const rect of Array.from(range.getClientRects())) {
            if (rect.height === 0 || rect.width === 0) continue;
            if (rect.bottom <= viewerRect.top || rect.top >= viewerRect.bottom) continue;
            if (rect.right <= viewerRect.left || rect.left >= viewerRect.right) continue;

            const top = Math.round((rect.top - viewerRect.top) * 100) / 100;
            const isDuplicate = tops.some((existing) => Math.abs(existing - top) < 1);
            if (!isDuplicate) {
              tops.push(top);
            }
          }
        }
      }

      return tops.sort((a, b) => a - b);
    };

    const visibleBodyLineTops = collectLineTops("p, li, blockquote, dd, dt").filter((top) => top >= 0);
    if (visibleBodyLineTops.length === 0) {
      throw new Error("Expected visible body text lines");
    }

    const bodyLineHeight = Number.parseFloat(window.getComputedStyle(shadowRoot.querySelector("p")!).lineHeight);
    if (!Number.isFinite(bodyLineHeight)) {
      throw new Error("Expected numeric paragraph line-height");
    }

    const firstBodyLineTop = visibleBodyLineTops[0]!;
    const firstBodyLineOffset = Math.round((firstBodyLineTop % bodyLineHeight) * 100) / 100;
    const distinctBodyLineOffsets = visibleBodyLineTops.reduce<number[]>((offsets, top) => {
      const offset = Math.round((top % bodyLineHeight) * 100) / 100;
      const isDuplicate = offsets.some((existing) => Math.abs(existing - offset) < 1);
      if (!isDuplicate) {
        offsets.push(offset);
      }
      return offsets;
    }, []);

    return {
      headingBackgroundColor: window.getComputedStyle(heading).backgroundColor,
      headingText: heading.textContent?.trim() ?? null,
      gridUnit: Math.round(bodyLineHeight * 100) / 100,
      firstBodyLineTop,
      firstBodyLineOffset,
      distinctBodyLineOffsets,
      visibleBodyLineTops,
    };
  });

export type SpreadColumnMetrics = {
  leftFirstLineTop: number;
  rightFirstLineTop: number;
  leftDistinctOffsets: number[];
  rightDistinctOffsets: number[];
  gridUnit: number;
  headingWidth: number;
  dividerWidth: number;
  leftColumnWidth: number;
};

export const getSpreadColumnMetrics = async (page: Page): Promise<SpreadColumnMetrics> =>
  await page.evaluate(() => {
    const viewer = document.querySelector(".reader-viewer");
    const shadowRoot = document.querySelector(".epub-shadow-host")?.shadowRoot;
    const paragraph = shadowRoot?.querySelector("p");

    if (!viewer || !shadowRoot || !paragraph) {
      throw new Error("Reader content is not ready");
    }

    const viewerRect = viewer.getBoundingClientRect();
    const columnMidpoint = viewerRect.left + viewerRect.width / 2;
    const lineHeight = Number.parseFloat(window.getComputedStyle(paragraph).lineHeight);

    if (!Number.isFinite(lineHeight)) {
      throw new Error("Expected numeric paragraph line-height");
    }

    const leftTops: number[] = [];
    const rightTops: number[] = [];

    for (const element of Array.from(shadowRoot.querySelectorAll<HTMLElement>("p"))) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

      while (walker.nextNode()) {
        const textNode = walker.currentNode;
        if (!textNode.textContent?.trim()) continue;

        const range = document.createRange();
        range.selectNodeContents(textNode);

        for (const rect of Array.from(range.getClientRects())) {
          if (rect.height === 0 || rect.width === 0) continue;
          if (rect.bottom <= viewerRect.top || rect.top >= viewerRect.bottom) continue;
          if (rect.right <= viewerRect.left || rect.left >= viewerRect.right) continue;

          const top = Math.round((rect.top - viewerRect.top) * 100) / 100;
          const target = rect.left < columnMidpoint ? leftTops : rightTops;

          if (!target.some((existing) => Math.abs(existing - top) < 1)) {
            target.push(top);
          }
        }
      }
    }

    leftTops.sort((a, b) => a - b);
    rightTops.sort((a, b) => a - b);

    if (leftTops.length === 0 || rightTops.length === 0) {
      throw new Error("Expected visible text lines in both columns");
    }

    const toDistinctOffsets = (tops: number[]) =>
      tops.reduce<number[]>((offsets, top) => {
        const offset = Math.round((((top % lineHeight) + lineHeight) % lineHeight) * 100) / 100;
        if (!offsets.some((existing) => Math.abs(existing - offset) < 1)) {
          offsets.push(offset);
        }
        return offsets;
      }, []);

    return {
      leftFirstLineTop: leftTops[0]!,
      rightFirstLineTop: rightTops[0]!,
      leftDistinctOffsets: toDistinctOffsets(leftTops),
      rightDistinctOffsets: toDistinctOffsets(rightTops),
      gridUnit: Math.round(lineHeight * 100) / 100,
      headingWidth: Math.round((shadowRoot.querySelector("h1")?.getBoundingClientRect().width ?? 0) * 100) / 100,
      dividerWidth: Math.round((shadowRoot.querySelector("hr")?.getBoundingClientRect().width ?? 0) * 100) / 100,
      leftColumnWidth: Math.round((viewerRect.width / 2) * 100) / 100,
    };
  });

export type VisibleTextGridMetrics = {
  leftDistinctOffsets: number[];
  rightDistinctOffsets: number[];
  leftFirstLineTop: number;
  rightFirstLineTop: number;
  gridUnit: number;
};

export type HorizontalBleedMetrics = {
  maxLeftBleed: number;
  maxRightBleed: number;
};

export const getVisibleHorizontalBleed = async (page: Page): Promise<HorizontalBleedMetrics> =>
  await page.evaluate(() => {
    const viewer = document.querySelector(".reader-viewer");
    const shadowRoot = document.querySelector(".epub-shadow-host")?.shadowRoot;

    if (!viewer || !shadowRoot) {
      throw new Error("Reader content is not ready");
    }

    const viewerRect = viewer.getBoundingClientRect();
    let maxLeftBleed = 0;
    let maxRightBleed = 0;

    for (const element of Array.from(shadowRoot.querySelectorAll<HTMLElement>("p"))) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

      while (walker.nextNode()) {
        const textNode = walker.currentNode;
        if (!textNode.textContent?.trim()) continue;

        const range = document.createRange();
        range.selectNodeContents(textNode);

        for (const rect of Array.from(range.getClientRects())) {
          if (rect.height === 0 || rect.width === 0) continue;
          if (rect.bottom <= viewerRect.top || rect.top >= viewerRect.bottom) continue;
          if (rect.right <= viewerRect.left || rect.left >= viewerRect.right) continue;

          if (rect.left < viewerRect.left) {
            maxLeftBleed = Math.max(maxLeftBleed, viewerRect.left - rect.left);
          }
          if (rect.right > viewerRect.right) {
            maxRightBleed = Math.max(maxRightBleed, rect.right - viewerRect.right);
          }
        }
      }
    }

    return {
      maxLeftBleed: Math.round(maxLeftBleed * 100) / 100,
      maxRightBleed: Math.round(maxRightBleed * 100) / 100,
    };
  });

export const getVisibleTextGridMetrics = async (page: Page): Promise<VisibleTextGridMetrics> =>
  await page.evaluate(() => {
    const viewer = document.querySelector(".reader-viewer");
    const shadowRoot = document.querySelector(".epub-shadow-host")?.shadowRoot;
    const paragraph = shadowRoot?.querySelector("p");

    if (!viewer || !shadowRoot || !paragraph) {
      throw new Error("Reader content is not ready");
    }

    const viewerRect = viewer.getBoundingClientRect();
    const columnMidpoint = viewerRect.left + viewerRect.width / 2;
    const lineHeight = Number.parseFloat(window.getComputedStyle(paragraph).lineHeight);

    const leftTops: number[] = [];
    const rightTops: number[] = [];

    for (const element of Array.from(shadowRoot.querySelectorAll<HTMLElement>("p"))) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

      while (walker.nextNode()) {
        const textNode = walker.currentNode;
        if (!textNode.textContent?.trim()) continue;

        const range = document.createRange();
        range.selectNodeContents(textNode);

        for (const rect of Array.from(range.getClientRects())) {
          if (rect.height === 0 || rect.width === 0) continue;
          if (rect.bottom <= viewerRect.top || rect.top >= viewerRect.bottom) continue;
          if (rect.right <= viewerRect.left || rect.left >= viewerRect.right) continue;

          const top = Math.round((rect.top - viewerRect.top) * 100) / 100;
          const target = rect.left < columnMidpoint ? leftTops : rightTops;

          if (!target.some((existing) => Math.abs(existing - top) < 1)) {
            target.push(top);
          }
        }
      }
    }

    leftTops.sort((a, b) => a - b);
    rightTops.sort((a, b) => a - b);

    const toDistinctOffsets = (tops: number[]) =>
      tops.reduce<number[]>((offsets, top) => {
        const offset = Math.round((((top % lineHeight) + lineHeight) % lineHeight) * 100) / 100;
        if (!offsets.some((existing) => Math.abs(existing - offset) < 1)) {
          offsets.push(offset);
        }
        return offsets;
      }, []);

    if (leftTops.length === 0 || rightTops.length === 0) {
      throw new Error("Expected visible text lines in both columns");
    }

    return {
      leftDistinctOffsets: toDistinctOffsets(leftTops),
      rightDistinctOffsets: toDistinctOffsets(rightTops),
      leftFirstLineTop: leftTops[0]!,
      rightFirstLineTop: rightTops[0]!,
      gridUnit: Math.round(lineHeight * 100) / 100,
    };
  });
