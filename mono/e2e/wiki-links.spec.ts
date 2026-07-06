import { expect, test } from "@playwright/test";
import { expectStoredNotes } from "./noteAssertions";
import { createStoredNote } from "./noteStorage";

test("auto-suffixes a renamed note when the title collides", async ({ page }) => {
  await createStoredNote(page, { name: "Project", content: "original" });

  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.type("Project");

  await expectStoredNotes(page, [
    { name: "Project", content: "original" },
    { name: "Project 2", content: "" },
  ]);
  await expect(editor).toContainText("Project 2");
});

test("inserts an existing note wiki link from autocomplete", async ({ page }) => {
  await createStoredNote(page, { name: "Target", content: "linked note" });

  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.type("Source");
  await page.keyboard.press("Enter");
  await page.keyboard.type("[[Tar");

  await expect(page.locator(".wiki-link-completion button", { hasText: "Target" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect
    .poll(
      async () =>
        await page
          .locator(".md-wiki-link .markdown-delimiter")
          .first()
          .evaluate((element) => getComputedStyle(element).display),
    )
    .toBe("none");
  await page.keyboard.type(" after");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.type("X");

  await expectStoredNotes(page, [
    { name: "Target", content: "linked note" },
    { name: "Source", content: "[[Target]] Xafter" },
  ]);
});

test("replaces an edited wiki link without duplicating closing brackets", async ({ page }) => {
  await createStoredNote(page, { name: "Target", content: "linked note" });
  await createStoredNote(page, { name: "Task", content: "replacement note" });

  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.type("Source");
  await page.keyboard.press("Enter");
  await page.keyboard.type("[[Target]]");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");

  await expect(page.locator(".wiki-link-completion button", { hasText: "Task" })).toBeVisible();
  await page.keyboard.press("Enter");

  await expectStoredNotes(page, [
    { name: "Target", content: "linked note" },
    { name: "Task", content: "replacement note" },
    { name: "Source", content: "[[Task]]" },
  ]);
});

test("keeps wiki link autocomplete attached to the caret while filtering", async ({ page }) => {
  await createStoredNote(page, { name: "Target", content: "linked note" });

  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.type("Source");
  await page.keyboard.press("Enter");
  await page.keyboard.type("[[Tar");

  const menu = page.locator(".wiki-link-completion");
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("data-direction", /.+/);

  const placement = await page.evaluate(() => {
    const getPlacement = () => {
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const caret = range?.getClientRects()[0] || range?.getBoundingClientRect();
      const menuRect = document.querySelector(".wiki-link-completion")!.getBoundingClientRect();

      return {
        caretBottom: caret?.bottom ?? 0,
        caretLeft: caret?.left ?? 0,
        menuTop: menuRect.top,
        menuLeft: menuRect.left,
        direction: (document.querySelector(".wiki-link-completion") as HTMLElement).dataset.direction,
      };
    };

    return getPlacement();
  });

  expect(placement.direction).toBe("down-right");
  expect(placement.menuTop).toBeGreaterThanOrEqual(placement.caretBottom);
  expect(placement.menuLeft).toBeGreaterThanOrEqual(0);
  expect(Math.abs(placement.menuLeft - placement.caretLeft)).toBeLessThan(200);

  await page.keyboard.type("g");
  await expect(page.locator(".wiki-link-completion button", { hasText: "Target" })).toBeVisible();
  const after = await page.evaluate(() => {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const caret = range?.getClientRects()[0] || range?.getBoundingClientRect();
    const menuRect = document.querySelector(".wiki-link-completion")!.getBoundingClientRect();

    return {
      caretBottom: caret?.bottom ?? 0,
      caretLeft: caret?.left ?? 0,
      menuTop: menuRect.top,
      menuLeft: menuRect.left,
    };
  });

  expect(after.menuTop).toBeGreaterThanOrEqual(after.caretBottom);
  expect(after.menuLeft).toBeGreaterThanOrEqual(after.caretLeft - 1);
});

test("keeps an upward wiki link autocomplete anchored to the caret as results shrink", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 520 });

  for (const name of ["Taco", "Tangent", "Tape", "Task", "Target", "Tarot", "Tartan", "Tablet"]) {
    await createStoredNote(page, { name, content: `${name} note` });
  }

  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.type("Source");
  for (let index = 0; index < 10; index += 1) {
    await page.keyboard.press("Enter");
  }
  await page.keyboard.type("[[Ta");

  const menu = page.locator(".wiki-link-completion");
  await expect(menu).toBeVisible();

  const before = await page.evaluate(() => {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const caret = range?.getClientRects()[0] || range?.getBoundingClientRect();
    const menuElement = document.querySelector(".wiki-link-completion") as HTMLElement;
    const menuRect = menuElement.getBoundingClientRect();

    return {
      caretTop: caret?.top ?? 0,
      caretLeft: caret?.left ?? 0,
      menuTop: menuRect.top,
      menuBottom: menuRect.bottom,
      menuLeft: menuRect.left,
      direction: menuElement.dataset.direction,
    };
  });

  expect(before.direction).toBe("up-right");
  expect(before.menuBottom).toBeLessThanOrEqual(before.caretTop);
  expect(before.menuLeft).toBeGreaterThanOrEqual(0);
  expect(Math.abs(before.menuLeft - before.caretLeft)).toBeLessThan(200);

  await page.keyboard.type("rget");
  await expect(page.locator(".wiki-link-completion button", { hasText: "Target" })).toBeVisible();

  const after = await page.evaluate(() => {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const caret = range?.getClientRects()[0] || range?.getBoundingClientRect();
    const menuRect = document.querySelector(".wiki-link-completion")!.getBoundingClientRect();

    return {
      caretTop: caret?.top ?? 0,
      caretLeft: caret?.left ?? 0,
      menuTop: menuRect.top,
      menuBottom: menuRect.bottom,
      menuLeft: menuRect.left,
    };
  });

  expect(after.menuBottom).toBeLessThanOrEqual(after.caretTop);
  expect(after.menuTop).toBeGreaterThan(before.menuTop);
  expect(after.menuLeft).toBeGreaterThanOrEqual(0);
  expect(Math.abs(after.menuLeft - after.caretLeft)).toBeLessThan(200);
});

test("opens an existing note from a wiki link", async ({ page }) => {
  const targetId = await createStoredNote(page, { name: "Target", content: "linked note" });
  const sourceId = await createStoredNote(page, { name: "Source", content: "[[Target]]" });

  await page.goto(`/note/${sourceId}`);
  const link = page.locator(".md-wiki-link", { hasText: "Target" });
  await expect(link).toBeVisible();
  await expect(link).toContainText("Target");
  await expect(link).toHaveAttribute("href", new RegExp(`/note/${targetId}$`));
  await link.click();

  await expect(page).toHaveURL(new RegExp(`/note/${targetId}$`));
  await expect(page.locator(".editor")).toContainText("linked note");
  await expect(page.locator(".editor")).not.toContainText("[[Target]]");
});

test("creates a missing note from a wiki link", async ({ page }) => {
  const sourceId = await createStoredNote(page, { name: "Source", content: "[[Missing]]" });

  await page.goto(`/note/${sourceId}`);
  const link = page.locator(".md-wiki-link", { hasText: "Missing" });
  await expect(link).toBeVisible();
  await expect(link).toContainText("Missing");
  await expect(link).toHaveAttribute("href", /\/new\?name=Missing$/);
  await link.click();

  await expect(page).toHaveURL(/\/note\/\d+$/);
  await expect(page.locator(".editor")).toContainText("Missing");
  await expect(page.locator(".editor")).not.toContainText("[[Missing]]");
  await expectStoredNotes(page, [
    { name: "Source", content: "[[Missing]]" },
    { name: "Missing", content: "" },
  ]);
});
