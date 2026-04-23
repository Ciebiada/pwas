import { expect, test } from "@playwright/test";
import { expectStoredNotes } from "./noteAssertions";
import { createStoredNote } from "./noteStorage";

const setEditorCursor = async (page: Parameters<typeof test>[0]["page"], offset: number) => {
  await page.evaluate((targetOffset) => {
    const editor = document.querySelector<HTMLElement>(".editor");
    if (!editor) throw new Error("Editor not found");

    const getTextLength = (node: Node): number => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;

      let length = 0;
      node.childNodes.forEach((child) => {
        length += getTextLength(child);
      });
      return length;
    };

    const createBoundary = (offsetInEditor: number) => {
      let accumulated = 0;
      const blocks = Array.from(editor.childNodes);

      for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
        const block = blocks[blockIndex];
        const blockLength = getTextLength(block);

        if (accumulated + blockLength >= offsetInEditor) {
          const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
          let node: Node | null = walker.nextNode();
          let blockOffset = accumulated;

          while (node) {
            const text = node.textContent || "";
            if (blockOffset + text.length >= offsetInEditor) {
              return { node, offset: offsetInEditor - blockOffset };
            }
            blockOffset += text.length;
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

    const boundary = createBoundary(targetOffset);
    const range = document.createRange();
    range.setStart(boundary.node, boundary.offset);
    range.collapse(true);

    editor.focus();
    selection.removeAllRanges();
    selection.addRange(range);
  }, offset);
};

test("typing a cookie leaves the raw token unchanged", async ({ page }) => {
  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.type("Project");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Status [/] after");

  await expectStoredNotes(page, [
    {
      name: "Project",
      content: "Status [/] after",
    },
  ]);
});

test("nested cookies only count todos on their immediate child indentation level", async ({ page }) => {
  const noteId = await createStoredNote(page, {
    name: "Project",
    content:
      "- Project [/]\n    - [x] Done\n    - Group [%]\n        - [x] Nested done\n        - [ ] Nested todo\n    - [ ] Todo",
  });

  await page.goto(`/note/${noteId}`);
  await page.locator(".md-checkbox .md-list-marker label").nth(2).click();

  await expectStoredNotes(page, [
    {
      name: "Project",
      content:
        "- Project [1/2]\n    - [x] Done\n    - Group [100%]\n        - [x] Nested done\n        - [x] Nested todo\n    - [ ] Todo",
    },
  ]);
});

test("a regular line cookie updates from a following checklist", async ({ page }) => {
  const noteId = await createStoredNote(page, {
    name: "Project",
    content: "Notes [/]\n- [ ] One\n- [ ] Two",
  });

  await page.goto(`/note/${noteId}`);
  await page.locator(".md-checkbox .md-list-marker label").first().click();

  await expectStoredNotes(page, [
    {
      name: "Project",
      content: "Notes [1/2]\n- [x] One\n- [ ] Two",
    },
  ]);
});

test("adding a todo rewrites a parent cookie", async ({ page }) => {
  const noteId = await createStoredNote(page, {
    name: "Project",
    content: "- Project [/]\n    - [ ] One",
    cursor: "Project\n- Project [/]\n    - [ ] One".length,
  });

  await page.goto(`/note/${noteId}`);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.press("Enter");
  await page.keyboard.type("Two");

  await expectStoredNotes(page, [
    {
      name: "Project",
      content: "- Project [0/2]\n    - [ ] One\n    - [ ] Two",
    },
  ]);
});

test("moving a todo out of a subtree rewrites the parent cookie", async ({ page }) => {
  const name = "Project";
  const content = "- Project [0/2]\n    - [ ] One\n    - [ ] Two";
  const noteId = await createStoredNote(page, {
    name,
    content,
  });

  await page.goto(`/note/${noteId}`);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await setEditorCursor(page, `${name}\n- Project [0/2]\n    - [ ] One\n    - [ ] `.length);
  await page.keyboard.press("Backspace");

  await expectStoredNotes(page, [
    {
      name,
      content: "- Project [0/1]\n    - [ ] One\n- [ ] Two",
    },
  ]);
});
