import { expect, type Page, test } from "@playwright/test";
import { expectStoredNotes } from "./noteAssertions";
import { createStoredNote } from "./noteStorage";

const buildBodyLines = (count: number) =>
  Array.from({ length: count }, (_, index) => `Line ${String(index + 1).padStart(2, "0")} content`);

const getCaretState = async (page: Page) =>
  await page.evaluate(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) throw new Error("Expected selection");

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const anchor =
      range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
    const line = anchor instanceof Element ? anchor.closest<HTMLElement>(".md-line") : null;
    if (!line) throw new Error("Expected active line");

    const viewportBottom = (window.visualViewport?.height ?? window.innerHeight) - 16;

    return {
      bottomGap: viewportBottom - rect.bottom,
      lineText: line.textContent ?? "",
    };
  });

const expectCaretNearBottom = async (page: Page, expectedLineText: string) => {
  await expect.poll(async () => (await getCaretState(page)).bottomGap).toBeGreaterThanOrEqual(8);
  await expect.poll(async () => (await getCaretState(page)).bottomGap).toBeLessThanOrEqual(72);
  await expect.poll(async () => (await getCaretState(page)).lineText).toBe(expectedLineText);
};

const setCaretAtLineEnd = async (page: Page, lineIndexFromEnd: number) => {
  await page.evaluate((targetLineIndexFromEnd) => {
    const editor = document.querySelector<HTMLElement>(".editor");
    const lines = Array.from(document.querySelectorAll<HTMLElement>(".editor .md-line"));
    const line = lines.at(-(targetLineIndexFromEnd + 1));
    if (!editor || !line) throw new Error("Expected editor line");

    editor.focus({ preventScroll: true });

    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let lastTextNode: Text | null = null;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node instanceof Text && (node.textContent?.length ?? 0) > 0) lastTextNode = node;
    }

    if (!lastTextNode) throw new Error("Expected line text node");

    const selection = window.getSelection();
    if (!selection) throw new Error("Expected selection");

    const range = document.createRange();
    range.setStart(lastTextNode, lastTextNode.textContent?.length ?? 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }, lineIndexFromEnd);
};

test("keeps the caret visible near the bottom when typing on the last and second-to-last lines", async ({ page }) => {
  const name = "Long note";
  const bodyLines = buildBodyLines(40);
  const noteId = await createStoredNote(page, {
    name,
    content: bodyLines.join("\n"),
  });

  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));
  await expect(page.locator(".editor")).toBeVisible();

  const expectedAfterLastLineEdit = [...bodyLines];
  expectedAfterLastLineEdit[expectedAfterLastLineEdit.length - 1] += "!";

  await page.keyboard.type("!");

  await expectCaretNearBottom(page, expectedAfterLastLineEdit.at(-1)!);

  await setCaretAtLineEnd(page, 1);

  const expectedFinalBodyLines = [...expectedAfterLastLineEdit];
  expectedFinalBodyLines[expectedFinalBodyLines.length - 2] += "?";

  await page.keyboard.type("?");

  await expectCaretNearBottom(page, expectedFinalBodyLines.at(-2)!);
  await expectStoredNotes(page, [
    {
      name,
      content: expectedFinalBodyLines.join("\n"),
    },
  ]);
});
