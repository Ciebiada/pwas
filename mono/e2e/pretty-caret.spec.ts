import { expect, type Page, test } from "@playwright/test";
import { expectStoredNotes } from "./noteAssertions";

const getPrettyCaretAlignmentError = async (page: Page, selector: string) =>
  await page.evaluate((targetSelector) => {
    const container = document.querySelector<HTMLElement>(".editor-container");
    const caret = document.querySelector<HTMLElement>(".custom-caret");
    const formatted = document.querySelector(targetSelector);
    if (!container || !caret || !formatted) throw new Error("Expected editor elements");

    const textNode = Array.from(formatted.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    if (!textNode) throw new Error("Expected formatted text node");

    const textRange = document.createRange();
    textRange.selectNodeContents(textNode);

    const containerRect = container.getBoundingClientRect();
    const textRect = textRange.getBoundingClientRect();
    const caretLeft = parseFloat(window.getComputedStyle(caret).left);

    return Math.abs(caretLeft - (textRect.right - containerRect.left));
  }, selector);

test("keeps the pretty caret aligned when emphasis delimiters hide after ArrowRight", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("custom_caret_enabled", "true");
  });

  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
  const delimiters = page.locator("em .markdown-delimiter");

  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.type("Formatting");
  await page.keyboard.press("Enter");
  await page.keyboard.type("*");
  await page.keyboard.type("test");

  await expectStoredNotes(page, [
    {
      name: "Formatting",
      content: "*test*",
    },
  ]);

  await expect(delimiters.first()).toBeVisible();
  await expect(delimiters.nth(1)).toBeVisible();
  await expect.poll(async () => await getPrettyCaretAlignmentError(page, "em")).toBeLessThan(2);

  await page.keyboard.press("ArrowRight");

  await expect(delimiters.first()).toBeHidden();
  await expect(delimiters.nth(1)).toBeHidden();
  await expect.poll(async () => await getPrettyCaretAlignmentError(page, "em")).toBeLessThan(2);
});
