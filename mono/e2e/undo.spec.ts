import { expect, test } from "@playwright/test";
import { expectStoredNotes } from "./noteAssertions";

test("undo and redo restore grouped editor history", async ({ page }) => {
  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.type("Undo");
  await page.keyboard.press("Enter");
  await page.keyboard.type("abc");

  await expectStoredNotes(page, [
    {
      name: "Undo",
      content: "abc",
    },
  ]);

  await page.keyboard.press("ControlOrMeta+Z");

  await expectStoredNotes(page, [
    {
      name: "Undo",
      content: "",
    },
  ]);

  await page.keyboard.press("ControlOrMeta+Shift+Z");

  await expectStoredNotes(page, [
    {
      name: "Undo",
      content: "abc",
    },
  ]);
});
