import { expect, type Page, test } from "@playwright/test";
import { expectStoredNotes } from "./noteAssertions";
import { createStoredNote } from "./noteStorage";

type TestNote = {
  name: string;
  content: string;
  cursor?: number;
};

type NoteActionExpectation = {
  visible?: string[];
  hidden?: string[];
};

type ActionScenario = {
  title: string;
  note: TestNote;
  action: string;
  expectedContent: string;
  selection?: [start: number, end: number];
  expectations?: NoteActionExpectation;
  afterAction?: (page: Page) => Promise<void>;
};

const openStoredNote = async (page: Page, note: TestNote) => {
  const noteId = await createStoredNote(page, note);
  await page.goto(`/note/${noteId}`);
};

const expectSingleStoredNote = async (page: Page, note: Omit<TestNote, "cursor">) => {
  await expectStoredNotes(page, [note]);
};

const bodyOffset = (name: string, offset = 0) => name.length + 1 + offset;

const openNoteActions = async (page: Page) => {
  const noteMoreButton = page.locator(".header-button.header-right");
  await expect(noteMoreButton).toBeVisible();
  await noteMoreButton.click();
  await expect(page.getByRole("searchbox", { name: "Search actions" })).toBeVisible();
};

const waitForEditorFocus = async (page: Page) => {
  await expect
    .poll(async () => await page.evaluate(() => document.activeElement?.classList.contains("editor") ?? false))
    .toBe(true);
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

const selectBodyText = async (page: Page, name: string, start: number, end: number) => {
  await setEditorSelection(page, bodyOffset(name, start), bodyOffset(name, end));
};

const expectActionVisibility = async (page: Page, expectations: NoteActionExpectation = {}) => {
  for (const name of expectations.visible ?? []) {
    await expect(page.getByRole("button", { name })).toBeVisible();
  }

  for (const name of expectations.hidden ?? []) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
};

const runActionScenario = async (page: Page, scenario: ActionScenario) => {
  await openStoredNote(page, scenario.note);

  if (scenario.selection) {
    await selectBodyText(page, scenario.note.name, scenario.selection[0], scenario.selection[1]);
  }

  await openNoteActions(page);
  await expectActionVisibility(page, scenario.expectations);
  await page.getByRole("button", { name: scenario.action }).click();
  await scenario.afterAction?.(page);

  await expectSingleStoredNote(page, {
    name: scenario.note.name,
    content: scenario.expectedContent,
  });
};

const actionScenarios: ActionScenario[] = [
  {
    title: "shows Bold for selected text and wraps the selection with strong markers",
    note: { name: "Formatting", content: "hello world" },
    action: "Bold",
    expectedContent: "**hello** world",
    selection: [0, "hello".length],
    expectations: {
      visible: ["Bold", "Italic"],
      hidden: ["Remove Checked Tasks"],
    },
  },
  {
    title: "shows Italic for selected text and wraps the selection with emphasis markers",
    note: { name: "Formatting", content: "hello world" },
    action: "Italic",
    expectedContent: "hello *world*",
    selection: ["hello ".length, "hello world".length],
    expectations: {
      visible: ["Bold", "Italic"],
      hidden: ["Remove Checked Tasks"],
    },
  },
  {
    title: "shows Regular instead of Bold when selected text is already bold and removes the strong markers",
    note: { name: "Formatting", content: "**hello** world" },
    action: "Regular",
    expectedContent: "hello world",
    selection: ["**".length, "**hello".length],
    expectations: {
      visible: ["Regular", "Italic"],
      hidden: ["Bold"],
    },
  },
  {
    title: "shows Regular instead of Italic when selected text is already italic and removes the emphasis markers",
    note: { name: "Formatting", content: "*hello* world" },
    action: "Regular",
    expectedContent: "hello world",
    selection: ["*".length, "*hello".length],
    expectations: {
      visible: ["Regular", "Bold"],
      hidden: ["Italic"],
    },
  },
  {
    title: "replaces italic with bold instead of nesting markers when Bold is chosen",
    note: { name: "Formatting", content: "*hello* world" },
    action: "Bold",
    expectedContent: "**hello** world",
    selection: ["*".length, "*hello".length],
  },
  {
    title: "removes a longer bold span before applying italic to a partial selection inside it",
    note: { name: "Formatting", content: "**hello world**" },
    action: "Italic",
    expectedContent: "hello *world*",
    selection: ["**hello ".length, "**hello world".length],
  },
  {
    title: "removes a longer italic span before applying bold to a partial selection inside it",
    note: { name: "Formatting", content: "*hello world*" },
    action: "Bold",
    expectedContent: "hello **world**",
    selection: ["*hello ".length, "*hello world".length],
  },
  {
    title: "shows Bold without a selection and inserts a strong pair with the cursor inside",
    note: {
      name: "Formatting",
      content: "hello world",
      cursor: bodyOffset("Formatting", "hello world".length),
    },
    action: "Bold",
    expectedContent: "hello world**x**",
    expectations: {
      visible: ["Bold", "Italic"],
    },
    afterAction: async (page) => {
      await waitForEditorFocus(page);
      await page.keyboard.insertText("x");
    },
  },
  {
    title: "shows Italic without a selection and inserts an emphasis pair with the cursor inside",
    note: {
      name: "Formatting",
      content: "hello world",
      cursor: bodyOffset("Formatting", "hello world".length),
    },
    action: "Italic",
    expectedContent: "hello world*x*",
    expectations: {
      visible: ["Bold", "Italic"],
    },
    afterAction: async (page) => {
      await waitForEditorFocus(page);
      await page.keyboard.insertText("x");
    },
  },
];

actionScenarios.forEach((scenario) => {
  test(scenario.title, async ({ page }) => {
    await runActionScenario(page, scenario);
  });
});

test("triple-clicking a whole line and choosing Bold keeps both strong markers on the same line", async ({ page }) => {
  const note = { name: "Formatting", content: "hello world\nsecond line" };
  await openStoredNote(page, note);

  const line = page.locator(".md-text").nth(1);
  await expect(line).toBeVisible();
  await line.click({ clickCount: 3 });
  await openNoteActions(page);
  await page.getByRole("button", { name: "Bold" }).click();

  await expectSingleStoredNote(page, {
    name: note.name,
    content: "**hello world**\nsecond line",
  });
});

test("shows heading actions on a plain line and applies the chosen heading level", async ({ page }) => {
  const note = {
    name: "Formatting",
    content: "hello world",
    cursor: bodyOffset("Formatting"),
  };
  await openStoredNote(page, note);
  await openNoteActions(page);

  await expect(page.locator(".note-action-title-heading")).toBeVisible();
  await expect(page.locator(".note-action-heading-level-2")).toBeVisible();
  await expect(page.locator(".note-action-subheading")).toBeVisible();
  await page.locator(".note-action-heading-level-2").click();

  await expectSingleStoredNote(page, {
    name: note.name,
    content: "## hello world",
  });
});

test("filters note actions from the search field", async ({ page }) => {
  await openStoredNote(page, {
    name: "Formatting",
    content: "hello world",
    cursor: bodyOffset("Formatting"),
  });
  await openNoteActions(page);

  const search = page.getByRole("searchbox", { name: "Search actions" });
  await search.click();
  await expect(search).toBeFocused();

  await search.fill("head");
  await expect(page.locator(".note-action-heading-level-2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Bold" })).toHaveCount(0);

  await search.fill("dele");
  await expect(page.getByRole("button", { name: "Delete Note" })).toBeVisible();
  await expect(page.locator(".note-action-heading-level-2")).toHaveCount(0);
});

test("hides the current heading level action and keeps the other heading options", async ({ page }) => {
  const note = {
    name: "Formatting",
    content: "## hello world",
    cursor: bodyOffset("Formatting", "## ".length),
  };
  await openStoredNote(page, note);
  await openNoteActions(page);

  await expect(page.locator(".note-action-title-heading")).toBeVisible();
  await expect(page.locator(".note-action-heading-level-2")).toHaveCount(0);
  await expect(page.locator(".note-action-subheading")).toBeVisible();
  await page.locator(".note-action-subheading").click();

  await expectSingleStoredNote(page, {
    name: note.name,
    content: "### hello world",
  });
});

test("reorders actions globally based on usage", async ({ page }) => {
  await openStoredNote(page, {
    name: "First",
    content: "hello world",
    cursor: bodyOffset("First"),
  });
  await openNoteActions(page);
  await page.locator(".note-action-heading-level-2").click();

  await openStoredNote(page, {
    name: "Second",
    content: "hello world",
    cursor: bodyOffset("Second"),
  });
  await openNoteActions(page);

  const actionOrder = await page
    .locator(".modal-page .modal-button")
    .evaluateAll((elements) => elements.map((element) => element.className));

  expect(actionOrder[0]).toContain("note-action-heading-level-2");
});

test("shows Remove Checked Tasks inside a task list and removes checked items from that list", async ({ page }) => {
  const note = {
    name: "Todos",
    content: "- [x] done\n- [ ] keep\n- [x] later\nParagraph",
    cursor: bodyOffset("Todos", "- [x] done\n- [ ] ".length),
  };
  await openStoredNote(page, note);
  await openNoteActions(page);
  await expectActionVisibility(page, {
    visible: ["Remove Checked Tasks", "Bold", "Italic"],
  });
  await page.getByRole("button", { name: "Remove Checked Tasks" }).click();

  await expectSingleStoredNote(page, {
    name: note.name,
    content: "- [ ] keep\nParagraph",
  });
});
