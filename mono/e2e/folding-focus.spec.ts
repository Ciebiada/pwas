import { expect, type Locator, type Page, test } from "@playwright/test";
import { createStoredNote } from "./noteStorage";

// Fold toggles render as an absolutely-positioned overlay sibling (not nested in
// the heading), associated to the heading by a shared data-section-id.
const foldToggleFor = async (heading: Locator): Promise<Locator> => {
  const sectionId = await heading.getAttribute("data-section-id");
  if (!sectionId) throw new Error("Expected heading to have a data-section-id");
  return heading.page().locator(`.fold-toggle[data-section-id="${sectionId}"]`);
};

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
  const foldToggle = await foldToggleFor(heading);
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

test("unfold all works on the first tap for persisted folds on iOS", async ({ page, browserName }) => {
  test.skip(browserName !== "webkit", "This regression is specific to the mobile WebKit path.");

  const noteId = await createStoredNote(page, {
    name: "Fold persisted",
    content: "# Heading\nBody",
  });

  await page.goto(`/note/${noteId}`);

  const heading = page.locator("h1.md-h1").filter({ hasText: "Heading" });
  const foldToggle = await foldToggleFor(heading);
  const bodyLine = page.locator(".md-text").filter({ hasText: "Body" });

  await expect(foldToggle).toBeVisible();
  await foldToggle.tap();
  await expect(bodyLine).toBeHidden();

  await page.reload();
  await expect(bodyLine).toBeHidden();

  await page.locator(".header-button.header-right").tap();
  await expect(page.getByRole("button", { name: "Unfold All Sections", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unfold All Sections", exact: true }).tap();
  await expect(page.locator(".modal-content")).toHaveCount(0);
  await expect(page.locator(".modal-overlay")).toHaveCount(0);

  await expect(bodyLine).toBeVisible();
});
