import { expect, type Page, test } from "@playwright/test";
import { expectStoredNotes } from "./noteAssertions";
import { createStoredNote } from "./noteStorage";

type TestNote = {
  name: string;
  content: string;
  cursor?: number;
};

const bodyOffset = (name: string, offset = 0) => name.length + 1 + offset;

const openStoredNote = async (page: Page, note: TestNote) => {
  const noteId = await createStoredNote(page, note);
  await page.goto(`/note/${noteId}`);
  await expect(page.locator(".editor")).toBeVisible();
};

const setEditorSelection = async (page: Page, start: number, end: number) => {
  await page.evaluate(
    ({ startOffset, endOffset }) => {
      const editor = document.querySelector<HTMLElement>(".editor");
      if (!editor) throw new Error("Editor not found");

      const getTextLength = (node: Node): number => {
        if (node.nodeType === Node.TEXT_NODE) {
          return (node.textContent || "").replaceAll("\u200B", "").length;
        }

        let length = 0;
        node.childNodes.forEach((child) => {
          length += getTextLength(child);
        });
        return length;
      };

      const findOffsetInTextNode = (text: string, targetOffset: number) => {
        let visibleOffset = 0;

        for (let i = 0; i < text.length; i += 1) {
          if (text[i] === "\u200B") continue;
          if (visibleOffset === targetOffset) return i;
          visibleOffset += 1;
        }

        return text.length;
      };

      const createBoundary = (offset: number) => {
        let accumulated = 0;
        const blocks = Array.from(editor.childNodes);

        for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
          const block = blocks[blockIndex];
          const blockLength = getTextLength(block);

          if (accumulated + blockLength >= offset) {
            const targetOffset = offset - accumulated;
            const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
            let node: Node | null = walker.nextNode();
            let blockOffset = 0;

            while (node) {
              const text = node.textContent || "";
              const visibleLength = text.replaceAll("\u200B", "").length;

              if (blockOffset + visibleLength >= targetOffset) {
                return {
                  node,
                  offset: findOffsetInTextNode(text, targetOffset - blockOffset),
                };
              }

              blockOffset += visibleLength;
              node = walker.nextNode();
            }

            return { node: block, offset: block.childNodes.length };
          }

          accumulated += blockLength;
          if (blockIndex < blocks.length - 1) accumulated += 1;
        }

        return { node: editor, offset: editor.childNodes.length };
      };

      const selection = window.getSelection();
      if (!selection) throw new Error("Selection not available");

      const range = document.createRange();
      const startBoundary = createBoundary(startOffset);
      const endBoundary = createBoundary(endOffset);

      range.setStart(startBoundary.node, startBoundary.offset);
      range.setEnd(endBoundary.node, endBoundary.offset);

      editor.focus();
      selection.removeAllRanges();
      selection.addRange(range);
    },
    { startOffset: start, endOffset: end },
  );
};

const selectBodyText = async (page: Page, noteName: string, start: number, end: number) => {
  await setEditorSelection(page, bodyOffset(noteName, start), bodyOffset(noteName, end));
};

const openNoteActions = async (page: Page) => {
  await page.locator(".header-button.header-right").click();
  await expect(page.getByRole("searchbox", { name: "Search actions" })).toBeVisible();
};

test("Tab indents all selected checklist items across indentation levels", async ({ page }) => {
  const note = {
    name: "Lists",
    content: "- [ ] parent\n    - [ ] child\n- [ ] sibling\nParagraph",
  };
  await openStoredNote(page, note);
  await selectBodyText(page, note.name, 0, "- [ ] parent\n    - [ ] child\n- [ ] sibling".length);

  await page.keyboard.press("Tab");

  await expectStoredNotes(page, [
    {
      name: note.name,
      content: "    - [ ] parent\n        - [ ] child\n    - [ ] sibling\nParagraph",
    },
  ]);
});

test("Shift+Tab unindents selected ordered items and leaves root items at root", async ({ page }) => {
  const note = {
    name: "Lists",
    content: "1. parent\n    1. child\n2. sibling\nParagraph",
  };
  await openStoredNote(page, note);
  await selectBodyText(page, note.name, 0, "1. parent\n    1. child\n2. sibling".length);

  await page.keyboard.press("Shift+Tab");

  await expectStoredNotes(page, [
    {
      name: note.name,
      content: "1. parent\n2. child\n3. sibling\nParagraph",
    },
  ]);
});

test("note actions indent and unindent when the cursor is on a list item", async ({ page }) => {
  const note = {
    name: "Lists",
    content: "1. parent\n    1. child\n2. sibling",
    cursor: bodyOffset("Lists", "1. parent\n    1. ".length),
  };
  await openStoredNote(page, note);

  await openNoteActions(page);
  await expect(page.getByRole("button", { name: "Indent", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unindent", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unindent", exact: true }).click();

  await expectStoredNotes(page, [
    {
      name: note.name,
      content: "1. parent\n2. child\n3. sibling",
    },
  ]);

  await openNoteActions(page);
  await expect(page.getByRole("button", { name: "Indent", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Indent", exact: true }).click();

  await expectStoredNotes(page, [
    {
      name: note.name,
      content: "1. parent\n    1. child\n2. sibling",
    },
  ]);
});

test("note actions turn the current bullet item into a todo and back", async ({ page }) => {
  const note = {
    name: "Lists",
    content: "- first\n- second",
    cursor: bodyOffset("Lists", "- first".length),
  };
  await openStoredNote(page, note);

  await openNoteActions(page);
  await expect(page.getByRole("button", { name: "Turn Todo", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn Bullet", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn Bullet", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Turn Todo", exact: true }).click();

  await expectStoredNotes(page, [
    {
      name: note.name,
      content: "- [ ] first\n- second",
    },
  ]);

  await openNoteActions(page);
  await expect(page.getByRole("button", { name: "Turn Bullet", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Turn Bullet", exact: true }).click();

  await expectStoredNotes(page, [
    {
      name: note.name,
      content: "- first\n- second",
    },
  ]);
});

test("note actions turn selected bullet items into todos", async ({ page }) => {
  const note = {
    name: "Lists",
    content: "Project [/]\n- first\nParagraph\n* second\n- [x] done",
  };
  await openStoredNote(page, note);
  await selectBodyText(page, note.name, "Project [/]\n".length, "Project [/]\n- first\nParagraph\n* second".length);

  await openNoteActions(page);
  await page.getByRole("button", { name: "Turn Todo", exact: true }).click();

  await expectStoredNotes(page, [
    {
      name: note.name,
      content: "Project [0/1]\n- [ ] first\nParagraph\n- [ ] second\n- [x] done",
    },
  ]);
});

test("note actions turn selected todos into bullet items", async ({ page }) => {
  const note = {
    name: "Lists",
    content: "Project [/]\n- [x] done\n- [ ] later\n- keep",
  };
  await openStoredNote(page, note);
  await selectBodyText(page, note.name, "Project [/]\n".length, "Project [/]\n- [x] done\n- [ ] later".length);

  await openNoteActions(page);
  await page.getByRole("button", { name: "Turn Bullet", exact: true }).click();

  await expectStoredNotes(page, [
    {
      name: note.name,
      content: "Project [0/0]\n- done\n- later\n- keep",
    },
  ]);
});
