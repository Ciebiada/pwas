import { expect, test } from "@playwright/test";
import { expectStoredNotes } from "./noteAssertions";
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

test("moves into formatted text when deleting its trailing separator", async ({ page }) => {
  const noteId = await createStoredNote(page, {
    name: "Formatting",
    content: "**bold** ",
  });

  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));

  const editor = page.locator(".editor");
  const delimiters = page.locator("strong .markdown-delimiter");
  await editor.focus();
  await page
    .locator(".md-line")
    .last()
    .evaluate((line) => {
      const trailingText = line.lastChild;
      if (!(trailingText instanceof Text)) throw new Error("Expected trailing text");

      const selection = window.getSelection();
      if (!selection) throw new Error("Expected selection");

      const range = document.createRange();
      range.setStart(trailingText, trailingText.length);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    });

  await page.keyboard.press("Backspace");

  await expect(delimiters.first()).toBeVisible();
  await expect(delimiters.nth(1)).toBeVisible();

  await page.keyboard.type("X");
  await expectStoredNotes(page, [{ name: "Formatting", content: "**boldX**" }]);
});

test("keeps empty inline code delimiters visible until content is typed inside", async ({ page }) => {
  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
  const inlineCode = page.locator(".md-inline-code");

  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.type("Formatting");
  await page.keyboard.press("Enter");
  await page.keyboard.type("`");

  await expectStoredNotes(page, [
    {
      name: "Formatting",
      content: "``",
    },
  ]);

  await expect(inlineCode).toHaveCount(0);

  await page.keyboard.type("x");

  await expect(inlineCode).toHaveCount(1);
  await expect(page.locator(".md-inline-code .markdown-delimiter").first()).toBeVisible();
  await expect(page.locator(".md-inline-code .markdown-delimiter").nth(1)).toBeVisible();
});

test("shows fenced code markers only while the cursor is inside the code block", async ({ page }) => {
  const noteId = await createStoredNote(page, {
    name: "Formatting",
    content: "```\nconst value = 1\n```\nOutside",
  });

  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));

  const editor = page.locator(".editor");
  const fences = page.locator(".md-code-block-fence .markdown-fence-marker");

  await expect(editor).toBeVisible();
  await expect(fences).toHaveCount(2);
  await expect(fences.first()).toBeHidden();
  await expect(fences.nth(1)).toBeHidden();

  await page.locator(".md-code-block-content").evaluate((element) => {
    const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    if (!textNode) throw new Error("Expected code block text node");

    const selection = window.getSelection();
    if (!selection) throw new Error("Expected selection");

    const range = document.createRange();
    range.setStart(textNode, textNode.textContent?.length ?? 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  });

  await expect(fences.first()).toBeVisible();
  await expect(fences.nth(1)).toBeVisible();

  await page.keyboard.type("!");

  await expect(fences.first()).toBeVisible();
  await expect(fences.nth(1)).toBeVisible();

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

  await expect(fences.first()).toBeHidden();
  await expect(fences.nth(1)).toBeHidden();
});
