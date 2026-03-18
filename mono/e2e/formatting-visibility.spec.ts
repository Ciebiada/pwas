import { expect, test } from "@playwright/test";
import { createStoredNote } from "./noteStorage";

test("shows strong delimiters only while the cursor is inside the formatted text", async ({ page }) => {
  const noteId = await createStoredNote(page, {
    name: "Formatting",
    content: "**bold** regular",
  });

  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));

  const editor = page.locator(".editor");
  const delimiters = page.locator("strong .markdown-delimiter");

  await expect(editor).toBeVisible();
  await expect(delimiters).toHaveCount(2);
  await expect(delimiters.first()).toBeHidden();
  await expect(delimiters.nth(1)).toBeHidden();

  await page.locator("strong").evaluate((element) => {
    const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    if (!textNode) throw new Error("Expected bold text node");

    const selection = window.getSelection();
    if (!selection) throw new Error("Expected selection");

    const range = document.createRange();
    range.setStart(textNode, textNode.textContent?.length ?? 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  });

  await expect(delimiters.first()).toBeVisible();
  await expect(delimiters.nth(1)).toBeVisible();

  await page.keyboard.press("ArrowRight");

  await expect(delimiters.first()).toBeHidden();
  await expect(delimiters.nth(1)).toBeHidden();
});
