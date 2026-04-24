import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  getChapterPageMetrics,
  getSpreadColumnMetrics,
  getVisibleHorizontalBleed,
  getVisibleTextGridMetrics,
  goToChapterStart,
  openOnlyBook,
  resetReaderPwaState,
  setDarkTheme,
  uploadBook,
} from "./readerAssertions";

const PROJECT_HAIL_MARY_PATH = path.resolve(process.cwd(), "readium/Projekt_Hail_Mary.epub");
const KLARA_BOOK_PATH = path.resolve(process.cwd(), "readium/klara-i-slonce-kazuo-ishiguro-ebookpoint.epub");
const CHAPTER_TITLE = "ROZDZIAŁ 1";

test.beforeEach(async ({ page }) => {
  await setDarkTheme(page);
});

const openBook = async (page: Page, bookPath: string) => {
  await page.goto("/");
  await resetReaderPwaState(page);
  await page.reload();

  await uploadBook(page, bookPath);
  await openOnlyBook(page);
};

const openFirstChapter = async (page: Page) => {
  await openBook(page, PROJECT_HAIL_MARY_PATH);
  await goToChapterStart(page, CHAPTER_TITLE);
};

test("renders the first chapter heading with a dark background in dark theme", async ({ page }) => {
  await openFirstChapter(page);

  const firstPage = await getChapterPageMetrics(page);

  expect(firstPage.headingText).toBe(CHAPTER_TITLE);
  expect(firstPage.headingBackgroundColor).toBe("rgb(0, 0, 0)");
});

test("keeps the chapter heading on the left page only and preserves the same text grid in both columns", async ({
  page,
}) => {
  await openFirstChapter(page);

  const spread = await getSpreadColumnMetrics(page);

  expect(spread.gridUnit).toBeGreaterThan(0);
  expect(spread.leftDistinctOffsets).toHaveLength(1);
  expect(spread.rightDistinctOffsets).toHaveLength(1);
  expect(spread.leftFirstLineTop).toBeGreaterThan(120);
  expect(spread.rightFirstLineTop).toBeLessThan(40);
  expect(spread.leftDistinctOffsets[0]).toBeCloseTo(spread.rightDistinctOffsets[0]!, 1);
  expect(spread.headingWidth).toBeLessThanOrEqual(spread.leftColumnWidth + 2);
  expect(spread.dividerWidth).toBeLessThanOrEqual(spread.leftColumnWidth + 2);
});

test("keeps chapter pagination reasonable and later pages readable in dark theme", async ({ page }) => {
  await openFirstChapter(page);

  const firstIndicator = await page.locator(".page-indicator").textContent();
  const firstMatch = firstIndicator?.match(/(\d+)\s*\/\s*(\d+)/);
  if (!firstMatch) {
    throw new Error(`Unexpected page indicator: ${firstIndicator}`);
  }

  const initialPage = Number(firstMatch[1]);
  const totalPages = Number(firstMatch[2]);

  expect(initialPage).toBe(1);
  expect(totalPages).toBeLessThan(30);

  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);

  const secondSpread = await getChapterPageMetrics(page);
  expect(secondSpread.firstBodyLineTop).toBeLessThan(40);
  const secondSpreadBottom = await page.evaluate(() => {
    const viewer = document.querySelector(".reader-viewer");
    const shadowRoot = document.querySelector(".epub-shadow-host")?.shadowRoot;

    if (!viewer || !shadowRoot) {
      throw new Error("Reader content is not ready");
    }

    const viewerRect = viewer.getBoundingClientRect();
    let lastBottom = 0;

    for (const element of Array.from(shadowRoot.querySelectorAll<HTMLElement>("p"))) {
      const rect = element.getBoundingClientRect();
      if (rect.height === 0 || rect.width === 0) continue;
      if (rect.bottom <= viewerRect.top || rect.top >= viewerRect.bottom) continue;
      if (rect.right <= viewerRect.left || rect.left >= viewerRect.right) continue;

      lastBottom = Math.max(lastBottom, rect.bottom - viewerRect.top);
    }

    return Math.round(lastBottom * 100) / 100;
  });
  expect(secondSpreadBottom).toBeGreaterThan(650);

  for (let step = 0; step < 3; step += 1) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
  }

  const laterPage = await getChapterPageMetrics(page);
  expect(laterPage.gridUnit).toBeGreaterThan(0);

  const visibleTextColors = await page.evaluate(() => {
    const viewer = document.querySelector(".reader-viewer");
    const shadowRoot = document.querySelector(".epub-shadow-host")?.shadowRoot;

    if (!viewer || !shadowRoot) {
      throw new Error("Reader content is not ready");
    }

    const viewerRect = viewer.getBoundingClientRect();
    const visibleColors = new Set<string>();
    const elements = Array.from(shadowRoot.querySelectorAll<HTMLElement>("p, span, i, b, em, strong, a"));

    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      if (rect.height === 0 || rect.width === 0) continue;
      if (rect.bottom <= viewerRect.top || rect.top >= viewerRect.bottom) continue;
      if (rect.right <= viewerRect.left || rect.left >= viewerRect.right) continue;

      const text = element.textContent?.trim();
      if (!text) continue;

      visibleColors.add(window.getComputedStyle(element).color);
    }

    return Array.from(visibleColors);
  });

  expect(visibleTextColors.length).toBeGreaterThan(0);
  expect(visibleTextColors).not.toContain("rgb(0, 0, 0)");

  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
  }

  const leftEdgeBleed = await page.evaluate(() => {
    const viewer = document.querySelector(".reader-viewer");
    const shadowRoot = document.querySelector(".epub-shadow-host")?.shadowRoot;

    if (!viewer || !shadowRoot) {
      throw new Error("Reader content is not ready");
    }

    const viewerRect = viewer.getBoundingClientRect();
    let maxOverlap = 0;

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
          if (rect.left >= viewerRect.left) continue;

          const overlap = Math.min(rect.right, viewerRect.right) - viewerRect.left;
          maxOverlap = Math.max(maxOverlap, overlap);
        }
      }
    }

    return Math.round(maxOverlap * 100) / 100;
  });

  expect(leftEdgeBleed).toBeLessThanOrEqual(1);
});

test("keeps the text grid aligned on later pages that contain a divider", async ({ page }) => {
  await openFirstChapter(page);

  let foundDivider = false;

  for (let step = 0; step < 40; step += 1) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);

    const hasVisibleDivider = await page.evaluate(() => {
      const viewer = document.querySelector(".reader-viewer");
      const shadowRoot = document.querySelector(".epub-shadow-host")?.shadowRoot;

      if (!viewer || !shadowRoot) {
        throw new Error("Reader content is not ready");
      }

      const viewerRect = viewer.getBoundingClientRect();

      return Array.from(shadowRoot.querySelectorAll("hr")).some((hr) => {
        const rect = hr.getBoundingClientRect();
        const isVisible =
          rect.height > 0 &&
          rect.width > 0 &&
          rect.bottom > viewerRect.top &&
          rect.top < viewerRect.bottom &&
          rect.right > viewerRect.left &&
          rect.left < viewerRect.right;
        const isOpenerLike = rect.width > viewerRect.width * 0.4;

        return isVisible && !isOpenerLike;
      });
    });

    if (!hasVisibleDivider) continue;

    foundDivider = true;
    const metrics = await getVisibleTextGridMetrics(page);

    expect(metrics.gridUnit).toBeGreaterThan(0);
    expect(metrics.leftDistinctOffsets).toHaveLength(1);
    expect(metrics.rightDistinctOffsets).toHaveLength(1);
    expect(metrics.leftDistinctOffsets[0]).toBeCloseTo(metrics.rightDistinctOffsets[0]!, 1);
    break;
  }

  expect(foundDivider).toBe(true);
});

test("keeps page turns horizontally locked on smaller two-column screens", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await openFirstChapter(page);

  for (let step = 0; step < 16; step += 1) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(120);
  }

  const horizontalBleed = await getVisibleHorizontalBleed(page);

  expect(horizontalBleed.maxLeftBleed).toBeLessThanOrEqual(1);
  expect(horizontalBleed.maxRightBleed).toBeLessThanOrEqual(1);
});

test("keeps Klara i Słońce paginated across both pages after the first part heading", async ({ page }) => {
  await openBook(page, KLARA_BOOK_PATH);
  await goToChapterStart(page, "CZĘŚĆ PIERWSZA");

  let currentPage = 0;
  let totalPages = 0;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);

    const pageIndicator = await page.locator(".page-indicator").textContent();
    const match = pageIndicator?.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) {
      throw new Error(`Unexpected page indicator: ${pageIndicator}`);
    }

    currentPage = Number(match[1]);
    totalPages = Number(match[2]);
    if (totalPages > 20) {
      break;
    }
  }

  expect(currentPage).toBeLessThanOrEqual(2);
  expect(totalPages).toBeGreaterThan(20);

  const visibleColumns = await page.evaluate(() => {
    const viewer = document.querySelector(".reader-viewer");
    const shadowRoot = document.querySelector(".epub-shadow-host")?.shadowRoot;

    if (!viewer || !shadowRoot) {
      throw new Error("Reader content is not ready");
    }

    const viewerRect = viewer.getBoundingClientRect();
    const midpoint = viewerRect.left + viewerRect.width / 2;
    let leftFragments = 0;
    let rightFragments = 0;

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

          if (rect.left < midpoint) {
            leftFragments += 1;
          } else {
            rightFragments += 1;
          }
        }
      }
    }

    const headingText = shadowRoot.querySelector("h1, h2, h3")?.textContent?.trim() ?? "";

    return { leftFragments, rightFragments, headingText };
  });

  expect(visibleColumns.leftFragments).toBeGreaterThan(0);
  expect(visibleColumns.rightFragments).toBeGreaterThan(0);
  expect(visibleColumns.headingText.length).toBeLessThan(30);
});

test("pairs the Klara dedication and part opener on one spread instead of leaving a blank facing page", async ({
  page,
}) => {
  await openBook(page, KLARA_BOOK_PATH);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const hasDedication = await page.evaluate(() => {
      const root = document.querySelector(".epub-shadow-host")?.shadowRoot;
      const texts = Array.from(root?.querySelectorAll("h1, h2, h3, p") ?? []).map((el) => el.textContent?.trim() ?? "");
      return texts.some((text) => text.includes("Pamięci mojej matki"));
    });

    if (hasDedication) break;

    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
  }

  const spread = await page.evaluate(() => {
    const viewer = document.querySelector(".reader-viewer");
    const shadowRoot = document.querySelector(".epub-shadow-host")?.shadowRoot;

    if (!viewer || !shadowRoot) {
      throw new Error("Reader content is not ready");
    }

    const viewerRect = viewer.getBoundingClientRect();
    const midpoint = viewerRect.left + viewerRect.width / 2;
    const visibleBlocks = Array.from(shadowRoot.querySelectorAll<HTMLElement>("h1, h2, h3, p"))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          text: el.textContent?.trim() ?? "",
          left: rect.left,
          top: rect.top,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter(
        (rect) =>
          rect.text &&
          rect.width > 0 &&
          rect.right > viewerRect.left &&
          rect.left < viewerRect.right &&
          rect.top < viewerRect.bottom,
      );

    const leftTexts = visibleBlocks.filter((block) => block.left < midpoint).map((block) => block.text);
    const rightTexts = visibleBlocks.filter((block) => block.left >= midpoint).map((block) => block.text);

    return { leftTexts, rightTexts };
  });

  expect(spread.leftTexts.some((text) => text.includes("Pamięci mojej matki"))).toBe(true);
  expect(spread.rightTexts.some((text) => text.includes("CZĘŚĆ PIERWSZA"))).toBe(true);

  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);

  const nextSpreadTexts = await page.evaluate(() => {
    const root = document.querySelector(".epub-shadow-host")?.shadowRoot;
    return Array.from(root?.querySelectorAll("h1, h2, h3, p") ?? [])
      .map((el) => el.textContent?.trim() ?? "")
      .filter(Boolean);
  });

  expect(nextSpreadTexts.some((text) => text.includes("CZĘŚĆ PIERWSZA"))).toBe(false);
});

test("keeps the Klara dedication page from leaving a blank facing page in two-page layout", async ({ page }) => {
  await openBook(page, KLARA_BOOK_PATH);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const hasDedication = await page.evaluate(() => {
      const root = document.querySelector(".epub-shadow-host")?.shadowRoot;
      const texts = Array.from(root?.querySelectorAll("h1, h2, h3, p") ?? []).map((el) => el.textContent?.trim() ?? "");
      return texts.some((text) => text.includes("Pamięci mojej matki"));
    });

    if (hasDedication) break;

    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
  }

  const spread = await page.evaluate(() => {
    const viewer = document.querySelector(".reader-viewer");
    const shadowRoot = document.querySelector(".epub-shadow-host")?.shadowRoot;

    if (!viewer || !shadowRoot) {
      throw new Error("Reader content is not ready");
    }

    const viewerRect = viewer.getBoundingClientRect();
    const midpoint = viewerRect.left + viewerRect.width / 2;
    const visibleBlocks = Array.from(shadowRoot.querySelectorAll<HTMLElement>("h1, h2, h3, p"))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          text: el.textContent?.trim() ?? "",
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter(
        (rect) =>
          rect.text &&
          rect.width > 0 &&
          rect.height >= 0 &&
          rect.right > viewerRect.left &&
          rect.left < viewerRect.right &&
          rect.top < viewerRect.bottom,
      );

    const leftTexts = visibleBlocks.filter((block) => block.left < midpoint).map((block) => block.text);
    const rightTexts = visibleBlocks.filter((block) => block.left >= midpoint).map((block) => block.text);

    return { leftTexts, rightTexts };
  });

  expect(spread.leftTexts.some((text) => text.includes("Pamięci mojej matki"))).toBe(true);
  expect(spread.rightTexts.length).toBeGreaterThan(0);
});

test("does not create a blank follow-up page after the Klara table of contents", async ({ page }) => {
  await openBook(page, KLARA_BOOK_PATH);
  await goToChapterStart(page, "SPIS TREŚCI");

  const tocIndicator = await page.locator(".page-indicator").textContent();
  const tocMatch = tocIndicator?.match(/(\d+)\s*\/\s*(\d+)/);
  if (!tocMatch) {
    throw new Error(`Unexpected page indicator: ${tocIndicator}`);
  }

  expect(Number(tocMatch[2])).toBe(1);

  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);

  const nextTexts = await page.evaluate(() => {
    const root = document.querySelector(".epub-shadow-host")?.shadowRoot;
    return Array.from(root?.querySelectorAll("h1, h2, h3, p") ?? [])
      .map((el) => el.textContent?.trim() ?? "")
      .filter(Boolean);
  });

  expect(nextTexts.some((text) => text.includes("Pamięci mojej matki"))).toBe(true);
});
