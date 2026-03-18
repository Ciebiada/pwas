import { expect, test } from "@playwright/test";
import { expectStoredNotes } from "./noteAssertions";

test("creates a note with todos from keyboard input", async ({ page }) => {
  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.type("Groceries");
  await page.keyboard.press("Enter");
  await page.keyboard.type("x");
  await page.keyboard.press("Space");
  await page.keyboard.type("Buy milk");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Buy bread");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  await expectStoredNotes(page, [
    {
      name: "Groceries",
      content: "- [ ] Buy milk\n- [ ] Buy bread\n",
    },
  ]);
});
