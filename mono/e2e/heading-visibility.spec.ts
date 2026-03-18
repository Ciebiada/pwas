import { expect, test } from "@playwright/test";
import { createStoredNote } from "./noteStorage";

test("shows heading markers only while the cursor is on that heading line", async ({ page }) => {
  const noteId = await createStoredNote(page, {
    name: "Formatting",
    content: "# Heading\nBody",
  });

  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));

  const headingPrefix = page.locator(".md-h1 > .markdown-prefix");

  await expect(headingPrefix).toBeHidden();

  await page.locator(".md-h1").evaluate((element) => {
    const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    if (!textNode) throw new Error("Expected heading text node");

    const selection = window.getSelection();
    if (!selection) throw new Error("Expected selection");

    const range = document.createRange();
    range.setStart(textNode, textNode.textContent?.length ?? 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  });

  await expect(headingPrefix).toBeVisible();

  await page
    .locator(".md-text")
    .last()
    .evaluate((element) => {
      const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (!textNode) throw new Error("Expected body text node");

      const selection = window.getSelection();
      if (!selection) throw new Error("Expected selection");

      const range = document.createRange();
      range.setStart(textNode, textNode.textContent?.length ?? 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    });

  await expect(headingPrefix).toBeHidden();
});
