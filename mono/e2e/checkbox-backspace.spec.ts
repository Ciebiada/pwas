import { expect, type Page, test } from "@playwright/test";
import { expectStoredNotes } from "./noteAssertions";
import { createStoredNote } from "./noteStorage";

const bodyOffset = (name: string, offset = 0) => name.length + 1 + offset;

const openStoredNote = async (page: Page, note: { name: string; content: string; cursor?: number }) => {
  const noteId = await createStoredNote(page, note);
  await page.goto(`/note/${noteId}`);
  await expect(page.locator(".editor")).toBeVisible();
};

test("Backspace at the end of a checkbox prefix removes the entire prefix", async ({ page }) => {
  const note = {
    name: "Lists",
    content: "- [ ] something",
    cursor: bodyOffset("Lists", "- [ ] ".length),
  };
  await openStoredNote(page, note);

  await page.keyboard.press("Backspace");

  await expectStoredNotes(page, [
    {
      name: note.name,
      content: "something",
    },
  ]);
});

test("Alt+Backspace at the end of a checkbox prefix removes the entire prefix", async ({ page }) => {
  const note = {
    name: "Lists",
    content: "- [ ] something",
    cursor: bodyOffset("Lists", "- [ ] ".length),
  };
  await openStoredNote(page, note);

  await page.keyboard.press("Alt+Backspace");

  await expectStoredNotes(page, [
    {
      name: note.name,
      content: "something",
    },
  ]);
});
