import { expect, type Page, test } from "@playwright/test";
import { expectStoredNotes } from "./noteAssertions";
import { createStoredNote } from "./noteStorage";

const isEditorFocused = async (page: Page) =>
  await page.evaluate(() => document.activeElement === document.querySelector(".editor"));

test("toggling a checkbox does not focus the editor when the note opens unfocused on iOS", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "webkit", "This regression is specific to the mobile WebKit path.");

  const noteId = await createStoredNote(page, {
    name: "Groceries",
    content: "- [ ] Buy milk",
  });

  await page.goto(`/note/${noteId}`);

  const editor = page.locator(".editor");
  const checkbox = page.locator(".md-checkbox .md-list-marker label").first();

  await expect(editor).toBeVisible();
  await expect(checkbox).toBeVisible();
  await expect.poll(() => isEditorFocused(page)).toBe(false);

  await checkbox.tap();

  await expect.poll(() => isEditorFocused(page)).toBe(false);

  await expectStoredNotes(page, [
    {
      name: "Groceries",
      content: "- [x] Buy milk",
    },
  ]);
});
