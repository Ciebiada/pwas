import { expect, type Page, test } from "@playwright/test";
import { createStoredNote } from "./noteStorage";

const isEditorFocused = async (page: Page) =>
  await page.evaluate(() => document.activeElement === document.querySelector(".editor"));

const activeLineCount = async (page: Page) =>
  await page.evaluate(() => document.querySelectorAll(".editor .is-active-line").length);

test("tapping a fold chevron does not focus an unfocused editor on iOS", async ({ page, browserName }) => {
  test.skip(browserName !== "webkit", "This regression is specific to the mobile WebKit path.");

  const noteId = await createStoredNote(page, {
    name: "Fold focus",
    content: "# Heading\nBody",
  });

  await page.goto(`/note/${noteId}`);

  const editor = page.locator(".editor");
  const heading = page.locator("h1.md-h1").filter({ hasText: "Heading" });
  const foldToggle = heading.locator(".fold-toggle");
  const bodyLine = page.locator(".md-text").filter({ hasText: "Body" });

  await expect(editor).toBeVisible();
  await expect(foldToggle).toBeVisible();
  await expect.poll(() => isEditorFocused(page)).toBe(false);
  await expect.poll(() => activeLineCount(page)).toBe(0);

  await foldToggle.tap();

  await expect(bodyLine).toBeHidden();
  await expect.poll(() => isEditorFocused(page)).toBe(false);
  await expect.poll(() => activeLineCount(page)).toBe(0);
});
