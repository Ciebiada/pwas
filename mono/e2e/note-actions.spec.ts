import { expect, test } from "@playwright/test";
import { expectStoredNotes } from "./noteAssertions";
import { createStoredNote } from "./noteStorage";

test("deletes a note from the notes list actions modal after a long press", async ({ page }) => {
  await createStoredNote(page, {
    name: "Delete me",
    content: "This note should disappear",
  });

  await page.goto("/");

  const noteItem = page.locator(".note-item", { hasText: "Delete me" });
  await expect(noteItem).toBeVisible();

  await noteItem.hover();
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();

  await expect(page.getByText("Note Actions")).toBeVisible();
  await page.getByRole("button", { name: "Delete Note" }).click();

  await expectStoredNotes(page, []);
  await expect(page.getByText("Delete me")).toHaveCount(0);
});
