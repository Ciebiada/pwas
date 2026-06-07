import { expect, type Locator, test } from "@playwright/test";
import { createStoredNote } from "./noteStorage";

const setCaretInFirstTextNode = async (locator: Locator, offset: number) => {
  await locator.evaluate((element, offset) => {
    const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    if (!textNode) throw new Error("Expected text node");

    const selection = window.getSelection();
    if (!selection) throw new Error("Expected selection");

    const range = document.createRange();
    range.setStart(textNode, Math.min(offset, textNode.textContent?.length ?? 0));
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }, offset);
};

test("shows heading markers only when the cursor is at the heading start", async ({ page }) => {
  const noteId = await createStoredNote(page, {
    name: "Formatting",
    content: "### Heading\nBody",
  });

  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));

  const editor = page.locator(".editor");
  const heading = page.locator(".md-h3");
  const headingPrefix = page.locator(".md-h3 > .markdown-prefix");

  await expect(editor).toBeVisible();
  await editor.focus();
  await expect(headingPrefix).toBeHidden();

  await setCaretInFirstTextNode(heading, "Heading".length);

  await expect(headingPrefix).toBeHidden();

  await setCaretInFirstTextNode(heading, 0);

  await expect(headingPrefix).toBeVisible();

  await setCaretInFirstTextNode(page.locator(".md-text").last(), "Body".length);

  await expect(headingPrefix).toBeHidden();
});
