import { expect, type Locator, type Page, test } from "@playwright/test";
import { expectStoredNotes } from "./noteAssertions";
import { createStoredNote } from "./noteStorage";

type Point = {
  x: number;
  y: number;
};

const getHandleCenter = async (handle: Locator): Promise<Point> =>
  await handle.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  });

const getPointBeforeLine = async (line: Locator): Promise<Point> =>
  await line.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.right - 18,
      y: rect.top + 2,
    };
  });

const dispatchTouchPointer = async (
  target: Locator,
  type: "pointerdown" | "pointermove" | "pointerup",
  point: Point,
) => {
  await target.dispatchEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: point.x,
    clientY: point.y,
    pointerId: 7,
    pointerType: "touch",
  });
};

const focusLineAtOffset = async (line: Locator, offset: number) => {
  await line.evaluate((element, position) => {
    const editor = document.querySelector<HTMLElement>(".editor");
    if (!editor) throw new Error("Expected editor");

    const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    if (!textNode) throw new Error("Expected line text node");

    const selection = window.getSelection();
    if (!selection) throw new Error("Expected selection");

    const range = document.createRange();
    range.setStart(textNode, position);
    range.collapse(true);
    editor.focus();
    selection.removeAllRanges();
    selection.addRange(range);
  }, offset);
};

const getSelectedText = async (page: Page) => await page.evaluate(() => window.getSelection()?.toString() ?? "");

const isEditorFocused = async (page: Page) =>
  await page.evaluate(() => document.activeElement === document.querySelector(".editor"));

const pageScrollTop = async (page: Page) => await page.evaluate(() => document.querySelector(".page")?.scrollTop ?? 0);

const selectionAnchorText = async (page: Page) =>
  await page.evaluate(() => window.getSelection()?.anchorNode?.textContent ?? "");

const getPrettyCaretLeft = async (page: Page) =>
  await page.evaluate(() => {
    const caret = document.querySelector<HTMLElement>(".custom-caret");
    if (!caret) throw new Error("Expected pretty caret");
    return parseFloat(window.getComputedStyle(caret).left);
  });

const installVisualViewportMock = async (page: Page) =>
  await page.addInitScript(() => {
    const target = new EventTarget();
    let height = window.innerHeight;
    const viewport = {
      get height() {
        return height;
      },
      get offsetTop() {
        return 0;
      },
      get scale() {
        return 1;
      },
      get width() {
        return window.innerWidth;
      },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      setHeight(nextHeight: number) {
        height = nextHeight;
        target.dispatchEvent(new Event("resize"));
      },
    };

    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
  });

const setVisualViewportHeight = async (page: Page, height: number) =>
  await page.evaluate((nextHeight) => {
    const viewport = window.visualViewport as (VisualViewport & { setHeight?: (height: number) => void }) | null;

    if (viewport?.setHeight) {
      viewport.setHeight(nextHeight);
      return viewport.offsetTop + viewport.height;
    }

    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        addEventListener() {},
        height: nextHeight,
        offsetTop: viewport?.offsetTop ?? 0,
        removeEventListener() {},
        scale: viewport?.scale ?? 1,
        width: viewport?.width ?? window.innerWidth,
      },
    });

    return window.visualViewport!.offsetTop + window.visualViewport!.height;
  }, height);

test("dragging the active-line handle reorders and keeps the cursor on desktop", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "This regression covers the desktop mouse path.");

  const noteName = "Desktop handle reorder";
  const noteId = await createStoredNote(page, {
    name: noteName,
    content: "First line\nSecond line\nThird line",
    cursor: `${noteName}\nFirst line\nSecond line\nThird`.length,
  });

  await page.goto(`/note/${noteId}`);

  const firstLine = page.locator(".md-text").filter({ hasText: "First line" });
  const handle = page.locator(".line-reorder-handle");
  await expect(handle).toBeVisible();

  const start = await getHandleCenter(handle);
  const end = await getPointBeforeLine(firstLine);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await expect.poll(() => getSelectedText(page)).toBe("");
  await page.mouse.up();
  await expect.poll(() => isEditorFocused(page)).toBe(true);
  await expect.poll(() => selectionAnchorText(page)).toContain("Third line");
  await page.keyboard.type("!");

  await expectStoredNotes(page, [
    {
      name: noteName,
      content: "Third! line\nFirst line\nSecond line",
    },
  ]);
});

test("dragging the active-line handle reorders and keeps the cursor on iOS", async ({ page, browserName }) => {
  test.skip(browserName !== "webkit", "This regression is specific to the mobile WebKit path.");

  const noteId = await createStoredNote(page, {
    name: "iOS handle reorder",
    content: "First line\nSecond line\nThird line",
  });

  await page.goto(`/note/${noteId}`);

  const firstLine = page.locator(".md-text").filter({ hasText: "First line" });
  const thirdLine = page.locator(".md-text").filter({ hasText: "Third line" });
  const handle = page.locator(".line-reorder-handle");
  await expect(thirdLine).toBeVisible();
  await focusLineAtOffset(thirdLine, "Third".length);
  await expect(handle).toBeVisible();

  await dispatchTouchPointer(handle, "pointerdown", await getHandleCenter(handle));
  await dispatchTouchPointer(page.locator("body"), "pointermove", await getPointBeforeLine(firstLine));
  await expect.poll(() => getSelectedText(page)).toBe("");
  await dispatchTouchPointer(page.locator("body"), "pointerup", await getPointBeforeLine(firstLine));
  await expect.poll(() => isEditorFocused(page)).toBe(true);
  await expect.poll(() => selectionAnchorText(page)).toContain("Third line");
  await page.keyboard.type("!");

  await expectStoredNotes(page, [
    {
      name: "iOS handle reorder",
      content: "Third! line\nFirst line\nSecond line",
    },
  ]);
});

test("hides the active-line handle when the iOS keyboard closes", async ({ page, browserName }) => {
  test.skip(browserName !== "webkit", "This regression is specific to the mobile WebKit path.");

  await installVisualViewportMock(page);

  const noteId = await createStoredNote(page, {
    name: "iOS keyboard close",
    content: "First line\nSecond line\nThird line",
  });

  await page.goto(`/note/${noteId}`);

  const thirdLine = page.locator(".md-text").filter({ hasText: "Third line" });
  const handle = page.locator(".line-reorder-handle");
  await expect(thirdLine).toBeVisible();
  await expect(handle).toBeHidden();

  await focusLineAtOffset(thirdLine, "Third".length);
  await expect(handle).toBeVisible();

  await setVisualViewportHeight(page, 420);
  await expect(handle).toBeVisible();

  await setVisualViewportHeight(page, await page.evaluate(() => window.innerHeight));
  await expect(handle).toBeHidden();
  await expect.poll(() => isEditorFocused(page)).toBe(false);
});

test("keeps the cursor with the reordered line when the iOS keyboard closes during drag", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "webkit", "This regression is specific to the mobile WebKit path.");

  await installVisualViewportMock(page);

  const noteId = await createStoredNote(page, {
    name: "iOS drag cursor",
    content: "First line\nSecond line\nThird line",
  });

  await page.goto(`/note/${noteId}`);

  const firstLine = page.locator(".md-text").filter({ hasText: "First line" });
  const thirdLine = page.locator(".md-text").filter({ hasText: "Third line" });
  const handle = page.locator(".line-reorder-handle");
  await expect(thirdLine).toBeVisible();
  await focusLineAtOffset(thirdLine, "Third".length);
  await setVisualViewportHeight(page, 420);
  await expect(handle).toBeVisible();

  await dispatchTouchPointer(handle, "pointerdown", await getHandleCenter(handle));
  await dispatchTouchPointer(page.locator("body"), "pointermove", await getPointBeforeLine(firstLine));
  await dispatchTouchPointer(page.locator("body"), "pointerup", await getPointBeforeLine(firstLine));
  await setVisualViewportHeight(page, await page.evaluate(() => window.innerHeight));

  await expect.poll(() => isEditorFocused(page)).toBe(true);
  await expect.poll(() => selectionAnchorText(page)).toContain("Third line");
  await page.keyboard.type("!");

  await expectStoredNotes(page, [
    {
      name: "iOS drag cursor",
      content: "Third! line\nFirst line\nSecond line",
    },
  ]);
});

test("positions the hidden pretty caret before iOS editor focus", async ({ page, browserName }) => {
  test.skip(browserName !== "webkit", "This regression is specific to the mobile WebKit path.");

  await page.addInitScript(() => {
    localStorage.setItem("custom_caret_enabled", "true");
  });

  const noteName = "iOS pretty caret";
  const noteId = await createStoredNote(page, {
    name: noteName,
    content: "First line\nSecond line\nThird line",
    cursor: `${noteName}\nFirst line\nSecond line\nThird`.length,
  });

  await page.goto(`/note/${noteId}`);

  const thirdLine = page.locator(".md-text").filter({ hasText: "Third line" });
  await expect(thirdLine).toBeVisible();
  await expect.poll(() => getPrettyCaretLeft(page)).not.toBeNaN();
  const hiddenLeft = await getPrettyCaretLeft(page);

  await focusLineAtOffset(thirdLine, "Third".length);
  const focusedLeft = await getPrettyCaretLeft(page);
  await page.waitForTimeout(150);
  const settledLeft = await getPrettyCaretLeft(page);

  expect(Math.abs(focusedLeft - hiddenLeft)).toBeLessThan(1);
  expect(Math.abs(settledLeft - hiddenLeft)).toBeLessThan(1);
});

test("dragging the active-line handle near the visible bottom edge scrolls", async ({ page, browserName }) => {
  const noteName = "Handle auto-scroll";
  const noteId = await createStoredNote(page, {
    name: noteName,
    content: Array.from({ length: 80 }, (_, index) => `Line ${index + 1}`).join("\n"),
    cursor: `${noteName}\nLine 1\nLine 2\nLine 3`.length,
  });

  await page.goto(`/note/${noteId}`);

  const thirdLine = page.locator(".md-text").filter({ hasText: /^Line 3$/ });
  const handle = page.locator(".line-reorder-handle");
  await expect(thirdLine).toBeVisible();
  if (browserName === "webkit") await focusLineAtOffset(thirdLine, "Line 3".length);
  await expect(handle).toBeVisible();
  await expect.poll(() => pageScrollTop(page)).toBe(0);

  const viewportBottom = await setVisualViewportHeight(page, 420);
  const points = await page.locator(".page").evaluate((element, bottom) => {
    const rect = element.getBoundingClientRect();
    return {
      beforeEdge: {
        x: rect.right - 24,
        y: bottom - 32,
      },
      edge: {
        x: rect.right - 24,
        y: bottom - 8,
      },
    };
  }, viewportBottom);

  if (browserName === "webkit") {
    await dispatchTouchPointer(handle, "pointerdown", await getHandleCenter(handle));
    await dispatchTouchPointer(page.locator("body"), "pointermove", points.beforeEdge);
  } else {
    const start = await getHandleCenter(handle);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(points.beforeEdge.x, points.beforeEdge.y);
  }

  await page.waitForTimeout(100);
  await expect.poll(() => pageScrollTop(page)).toBe(0);

  if (browserName === "webkit") {
    await dispatchTouchPointer(page.locator("body"), "pointermove", points.edge);
  } else {
    await page.mouse.move(points.edge.x, points.edge.y);
  }

  await expect.poll(() => pageScrollTop(page)).toBeGreaterThan(0);
  await expect.poll(() => getSelectedText(page)).toBe("");

  if (browserName === "webkit") {
    await dispatchTouchPointer(page.locator("body"), "pointerup", points.edge);
  } else {
    await page.mouse.up();
  }
});
