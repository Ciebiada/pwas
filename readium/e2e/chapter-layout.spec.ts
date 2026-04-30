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
  waitForReaderContent,
} from "./readerAssertions";

const PROJECT_HAIL_MARY_PATH = path.resolve(process.cwd(), "readium/Projekt_Hail_Mary.epub");
const KLARA_BOOK_PATH = path.resolve(process.cwd(), "readium/klara-i-slonce-kazuo-ishiguro-ebookpoint.epub");
const CHAPTER_TITLE = "ROZDZIAŁ 1";
const PAGE_TURN_SETTLE_MS = 280;

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

const turnNextPage = async (page: Page) => {
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(PAGE_TURN_SETTLE_MS);
};

const readPageIndicator = async (page: Page) => {
  const text = await page.locator(".page-indicator").textContent();
  const match = text?.match(/(\d+)\s*\/\s*(\d+)(?:\s*•\s*([\d.]+)%?)?/);
  if (!match) {
    throw new Error(`Unexpected page indicator: ${text}`);
  }

  return {
    page: Number(match[1]),
    total: Number(match[2]),
    percentage: match[3] === undefined ? null : Number(match[3]),
  };
};

const getVisibleReaderTexts = async (page: Page) => {
  await waitForReaderContent(page);
  return await page.evaluate(() => {
    const viewer = document.querySelector(".reader-viewer");
    const shadowRoot = document.querySelector(".epub-shadow-host")?.shadowRoot;

    if (!viewer || !shadowRoot) {
      throw new Error("Reader content is not ready");
    }

    const viewerRect = viewer.getBoundingClientRect();

    return Array.from(shadowRoot.querySelectorAll<HTMLElement>("h1, h2, h3, p"))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          text: el.textContent?.trim() ?? "",
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
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
          rect.bottom > viewerRect.top &&
          rect.top < viewerRect.bottom,
      )
      .map((rect) => rect.text);
  });
};

const getVisibleSpreadTexts = async (page: Page) => {
  await waitForReaderContent(page);
  return await page.evaluate(() => {
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
          bottom: rect.bottom,
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
          rect.bottom > viewerRect.top &&
          rect.top < viewerRect.bottom,
      );

    return {
      leftTexts: visibleBlocks.filter((block) => block.left < midpoint).map((block) => block.text),
      rightTexts: visibleBlocks.filter((block) => block.left >= midpoint).map((block) => block.text),
    };
  });
};

const goToVisibleText = async (page: Page, text: string, maxAttempts = 24) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const visibleTexts = await getVisibleReaderTexts(page);
    if (visibleTexts.some((visibleText) => visibleText.includes(text))) return;

    await turnNextPage(page);
  }

  throw new Error(`Failed to reach visible text: ${text}`);
};

const expectKlaraDedicationOpenerSpread = async (page: Page) => {
  const spread = await getVisibleSpreadTexts(page);

  expect(spread.leftTexts.some((text) => text.includes("Pamięci mojej matki"))).toBe(true);
  expect(spread.rightTexts.some((text) => text.includes("CZĘŚĆ PIERWSZA"))).toBe(true);
  expect(spread.leftTexts.some((text) => text.includes("Kiedy Rosa"))).toBe(false);
  expect(spread.rightTexts.some((text) => text.includes("Kiedy Rosa"))).toBe(false);
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

  const { page: initialPage, total: totalPages } = await readPageIndicator(page);

  expect(initialPage).toBe(1);
  expect(totalPages).toBeLessThan(30);

  await turnNextPage(page);

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
    await turnNextPage(page);
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
    await turnNextPage(page);
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

test("reports two-column spreads as page columns in the footer", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await openFirstChapter(page);

  const firstSpread = await readPageIndicator(page);
  await turnNextPage(page);
  const secondSpread = await readPageIndicator(page);

  expect(firstSpread.page).toBe(1);
  expect(secondSpread.page).toBe(3);
  expect(secondSpread.total).toBe(firstSpread.total);
  expect(secondSpread.percentage).not.toBe(firstSpread.percentage);
  expect(secondSpread.percentage ?? 0).toBeGreaterThan(firstSpread.percentage ?? 0);
});

test("keeps the text grid aligned on later pages that contain a divider", async ({ page }) => {
  await openFirstChapter(page);

  let foundDivider = false;

  for (let step = 0; step < 40; step += 1) {
    await turnNextPage(page);

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
    await turnNextPage(page);
  }

  const horizontalBleed = await getVisibleHorizontalBleed(page);

  expect(horizontalBleed.maxLeftBleed).toBeLessThanOrEqual(1);
  expect(horizontalBleed.maxRightBleed).toBeLessThanOrEqual(1);
});

test("keeps reading progress stable when rotating between portrait and landscape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFirstChapter(page);

  for (let step = 0; step < 8; step += 1) {
    await turnNextPage(page);
  }

  const beforeRotate = await readPageIndicator(page);

  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(700);

  const afterRotate = await readPageIndicator(page);
  await turnNextPage(page);
  const landscapeTexts = await getVisibleReaderTexts(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);

  const afterRotateBack = await readPageIndicator(page);
  const portraitTexts = await getVisibleReaderTexts(page);

  expect(beforeRotate.page).toBeGreaterThan(1);
  expect(afterRotate.page).toBeGreaterThan(1);
  expect(afterRotateBack.page).toBeGreaterThan(1);
  expect(afterRotate.percentage).not.toBeNull();
  expect(afterRotateBack.percentage).not.toBeNull();
  expect(beforeRotate.percentage).not.toBeNull();
  expect(Math.abs(afterRotate.percentage! - beforeRotate.percentage!)).toBeLessThanOrEqual(0.75);
  expect(Math.abs(afterRotateBack.percentage! - afterRotate.percentage!)).toBeLessThanOrEqual(0.75);
  expect(portraitTexts.some((text) => landscapeTexts.some((landscapeText) => text === landscapeText))).toBe(true);
});

test("keeps Klara i Słońce paginated across both pages after the first part heading", async ({ page }) => {
  await openBook(page, KLARA_BOOK_PATH);
  await goToChapterStart(page, "CZĘŚĆ PIERWSZA");

  let currentPage = 0;
  let totalPages = 0;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await turnNextPage(page);

    const indicator = await readPageIndicator(page);
    currentPage = indicator.page;
    totalPages = indicator.total;
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
  await goToVisibleText(page, "Pamięci mojej matki");
  await expectKlaraDedicationOpenerSpread(page);

  await turnNextPage(page);

  const nextSpreadTexts = await getVisibleReaderTexts(page);

  expect(nextSpreadTexts.some((text) => text.includes("CZĘŚĆ PIERWSZA"))).toBe(false);
});

test("keeps the Klara part opener as a standalone page in portrait", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBook(page, KLARA_BOOK_PATH);
  await goToChapterStart(page, "CZĘŚĆ PIERWSZA");

  const visibleTexts = await getVisibleReaderTexts(page);
  const indicator = await page.locator(".page-indicator").textContent();

  expect(visibleTexts.some((text) => text.includes("Pamięci mojej matki"))).toBe(false);
  expect(visibleTexts.some((text) => text.includes("CZĘŚĆ PIERWSZA"))).toBe(true);
  expect(indicator?.trim()).toMatch(/1\s*\/\s*1/);
});

test("pairs the Klara dedication and part opener after rotating from portrait to landscape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBook(page, KLARA_BOOK_PATH);
  await goToChapterStart(page, "CZĘŚĆ PIERWSZA");

  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(500);

  await expectKlaraDedicationOpenerSpread(page);
});

test("rebuilds the Klara dedication slot after rotating from portrait to landscape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBook(page, KLARA_BOOK_PATH);
  await goToVisibleText(page, "Pamięci mojej matki");

  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(500);

  await expectKlaraDedicationOpenerSpread(page);
});

test("keeps the Klara part opener visible alone on a short landscape viewport", async ({ page }) => {
  await page.setViewportSize({ width: 850, height: 300 });
  await openBook(page, KLARA_BOOK_PATH);
  await goToVisibleText(page, "Pamięci mojej matki");
  await expectKlaraDedicationOpenerSpread(page);
});

test("keeps the Klara dedication page from leaving a blank facing page in two-page layout", async ({ page }) => {
  await openBook(page, KLARA_BOOK_PATH);
  await goToVisibleText(page, "Pamięci mojej matki");

  const spread = await getVisibleSpreadTexts(page);
  expect(spread.leftTexts.some((text) => text.includes("Pamięci mojej matki"))).toBe(true);
  expect(spread.rightTexts.length).toBeGreaterThan(0);
});

test("does not create a blank follow-up page after the Klara table of contents", async ({ page }) => {
  await openBook(page, KLARA_BOOK_PATH);
  await goToChapterStart(page, "SPIS TREŚCI");

  const tocIndicator = await readPageIndicator(page);
  expect(tocIndicator.total).toBe(1);

  await turnNextPage(page);

  const nextTexts = await page.evaluate(() => {
    const root = document.querySelector(".epub-shadow-host")?.shadowRoot;
    return Array.from(root?.querySelectorAll("h1, h2, h3, p") ?? [])
      .map((el) => el.textContent?.trim() ?? "")
      .filter(Boolean);
  });

  expect(nextTexts.some((text) => text.includes("Pamięci mojej matki"))).toBe(true);
});
