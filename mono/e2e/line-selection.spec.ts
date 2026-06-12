import { expect, test } from "@playwright/test";
import { expectStoredNotes } from "./noteAssertions";
import { createStoredNote } from "./noteStorage";

const setCaretAtEndOfBoldText = async (page) => {
  await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>(".editor");
    if (!editor) throw new Error("Expected editor");

    const strong = editor.querySelector(".md-inline-strong");
    if (!strong) throw new Error("Expected strong");

    const boldText = Array.from(strong.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent === "bold",
    );
    if (!boldText) throw new Error("Expected bold text node");

    const range = document.createRange();
    range.setStart(boldText, boldText.textContent?.length ?? 0);
    range.collapse(true);

    const selection = window.getSelection();
    if (!selection) throw new Error("Expected selection");
    selection.removeAllRanges();
    selection.addRange(range);
    editor.focus();
  });
};

const setSelectionRange = async (page, start: number, end: number) => {
  await page.evaluate(
    ({ start, end }) => {
      const editor = document.querySelector<HTMLElement>(".editor");
      if (!editor) throw new Error("Expected editor");

      const lines = Array.from(editor.querySelectorAll<HTMLElement>(".md-line"));
      let globalOffset = 0;
      let startNode: Node | null = null;
      let startOffset = 0;
      let endNode: Node | null = null;
      let endOffset = 0;

      for (let li = 0; li < lines.length; li++) {
        const walker = document.createTreeWalker(lines[li], NodeFilter.SHOW_TEXT);
        let textNode: Node | null;
        while ((textNode = walker.nextNode())) {
          const length = (textNode.textContent || "").length;
          if (!startNode && globalOffset + length > start) {
            startNode = textNode;
            startOffset = start - globalOffset;
          }
          if (!endNode && globalOffset + length > end) {
            endNode = textNode;
            endOffset = end - globalOffset;
            break;
          }
          globalOffset += length;
        }
        if (endNode) break;
        if (li < lines.length - 1) globalOffset += 1;
      }

      if (!startNode || !endNode) throw new Error("Could not find selection positions");

      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      const selection = window.getSelection();
      if (!selection) throw new Error("Expected selection");
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();
    },
    { start, end },
  );
};

test("selecting a whole heading line and pressing backspace removes the heading prefix", async ({ page }) => {
  const note = { name: "Test", content: "# Heading" };
  const noteId = await createStoredNote(page, note);
  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));

  const heading = page.locator(".md-h1");
  await expect(heading).toBeVisible();
  await heading.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");

  await expectStoredNotes(page, [
    {
      name: "Test",
      content: "",
    },
  ]);
});

test("selecting a whole line that starts with a bold word and pressing backspace removes the strong markers", async ({
  page,
}) => {
  const note = { name: "Test", content: "**bold**" };
  const noteId = await createStoredNote(page, note);
  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));

  const strong = page.locator(".md-inline-strong");
  await expect(strong).toBeVisible();
  await setCaretAtEndOfBoldText(page);
  await page.keyboard.press("Shift+Meta+ArrowLeft");
  await page.keyboard.press("Backspace");

  await expectStoredNotes(page, [
    {
      name: "Test",
      content: "",
    },
  ]);
});

test("double-clicking a bold word and typing removes the surrounding strong markers", async ({ page }) => {
  const note = { name: "Test", content: "**bold**" };
  const noteId = await createStoredNote(page, note);
  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));

  const strong = page.locator(".md-inline-strong");
  await expect(strong).toBeVisible();

  const clickTarget = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>(".editor");
    if (!editor) throw new Error("Expected editor");
    const strong = editor.querySelector(".md-inline-strong");
    if (!strong) throw new Error("Expected strong");
    const boldText = Array.from(strong.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent === "bold",
    );
    if (!boldText) throw new Error("Expected bold text node");
    const range = document.createRange();
    range.selectNode(boldText);
    const rect = range.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  });

  await page.mouse.dblclick(clickTarget.x, clickTarget.y);

  await page.keyboard.type("x");

  await expectStoredNotes(page, [
    {
      name: "Test",
      content: "x",
    },
  ]);
});

test("selecting up to half of a bold word and pressing backspace removes the delimiters", async ({ page }) => {
  const note = { name: "Test", content: "**bold**" };
  const noteId = await createStoredNote(page, note);
  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));

  await setSelectionRange(page, 5, 9);

  await page.keyboard.press("Backspace");

  await expectStoredNotes(page, [
    {
      name: "Test",
      content: "ld",
    },
  ]);
});

test("selecting across words up to half of a bold word and pressing backspace removes the delimiters", async ({
  page,
}) => {
  const note = { name: "Test", content: "hello **bold** world" };
  const noteId = await createStoredNote(page, note);
  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));

  await setSelectionRange(page, 5, 15);

  await page.keyboard.press("Backspace");

  await expectStoredNotes(page, [
    {
      name: "Test",
      content: "ld world",
    },
  ]);
});
