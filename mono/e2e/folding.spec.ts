import { expect, type Locator, type Page, test } from "@playwright/test";
import { expectStoredNotes } from "./noteAssertions";
import { createStoredNote } from "./noteStorage";

const foldedNoteContent = [
  "# Project",
  "intro",
  "## Child",
  "child body",
  "### Grandchild",
  "grand body",
  "# Next",
  "after",
].join("\n");

const openFoldedNote = async (page: Page) => {
  const noteId = await createStoredNote(page, {
    name: "Fold",
    content: foldedNoteContent,
  });

  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));
  await expect(page.locator(".editor")).toBeVisible();

  return noteId;
};

const openNoteActions = async (page: Page) => {
  const noteMoreButton = page.locator(".header-button.header-right");
  await expect(noteMoreButton).toBeVisible();
  await noteMoreButton.click();
  await expect(page.getByRole("searchbox", { name: "Search actions" })).toBeVisible();
};

const expectNoteActionsClosed = async (page: Page) => {
  await expect(page.locator(".modal-content")).toHaveCount(0);
  await expect(page.locator(".modal-overlay")).toHaveCount(0);
};

const lineWithText = (page: Page, selector: string, text: string) => page.locator(selector).filter({ hasText: text });

const setCaretAtLineEnd = async (line: Locator) => {
  await line.evaluate((element) => {
    const editor = document.querySelector<HTMLElement>(".editor");
    if (!editor) throw new Error("Expected editor");

    editor.focus({ preventScroll: true });

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.textContent) return NodeFilter.FILTER_REJECT;

        const parent = node.parentElement;
        if (parent?.closest("button, .markdown-prefix")) return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let lastTextNode: Text | null = null;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node instanceof Text) lastTextNode = node;
    }

    if (!lastTextNode) throw new Error("Expected text node");

    const selection = window.getSelection();
    if (!selection) throw new Error("Expected selection");

    const range = document.createRange();
    range.setStart(lastTextNode, lastTextNode.textContent?.length ?? 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  });
};

const getActiveLineText = async (page: Page) =>
  await page.evaluate(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    const anchor =
      range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
    const line = anchor instanceof Element ? anchor.closest<HTMLElement>(".md-line") : null;
    if (!line) return null;

    return (line.textContent ?? "").replaceAll("\u200B", "").trim();
  });

const getFoldToggleColor = async (heading: Locator) =>
  await heading.locator(".fold-toggle").evaluate((element) => getComputedStyle(element).color);

const getFoldStorageValue = async (page: Page, noteId: number) =>
  await page.evaluate((id) => localStorage.getItem(`mono:folded-sections:v1:${id}`), noteId);

test("folds and unfolds a hierarchical section from the gutter and remembers it locally", async ({ page }) => {
  const noteId = await openFoldedNote(page);

  const projectHeading = lineWithText(page, "h1.md-h1", "Project");
  const childHeading = lineWithText(page, "h2.md-h2", "Child");
  const grandchildHeading = lineWithText(page, "h3.md-h3", "Grandchild");
  const nextHeading = lineWithText(page, "h1.md-h1", "Next");
  const introLine = lineWithText(page, ".md-text", "intro");
  const childBodyLine = lineWithText(page, ".md-text", "child body");
  const grandBodyLine = lineWithText(page, ".md-text", "grand body");

  const foldChevronColor = await getFoldToggleColor(projectHeading);
  await setCaretAtLineEnd(childBodyLine);
  await projectHeading.locator(".fold-toggle").click();
  await expect.poll(async () => await getFoldToggleColor(projectHeading)).not.toBe(foldChevronColor);

  await expect.poll(async () => await getActiveLineText(page)).toBe("# Project");
  await expect(introLine).toBeHidden();
  await expect(childHeading).toBeHidden();
  await expect(childBodyLine).toBeHidden();
  await expect(grandchildHeading).toBeHidden();
  await expect(grandBodyLine).toBeHidden();
  await expect(nextHeading).toBeVisible();

  await page.reload();
  await expect(page.locator(".editor")).toBeVisible();
  await expect(introLine).toBeHidden();
  await expect(childHeading).toBeHidden();
  await expect(nextHeading).toBeVisible();

  await projectHeading.locator(".fold-toggle").click();
  await expect(introLine).toBeVisible();
  await expect(childHeading).toBeVisible();
  await expect(childBodyLine).toBeVisible();
  await expect(grandchildHeading).toBeVisible();
  await expect(grandBodyLine).toBeVisible();
  await expect.poll(async () => await getFoldStorageValue(page, noteId)).toBeNull();

  await expectStoredNotes(page, [
    {
      name: "Fold",
      content: foldedNoteContent,
    },
  ]);
});

test("arrow keys move around folded content without entering hidden section lines", async ({ page }) => {
  await openFoldedNote(page);

  const projectHeading = lineWithText(page, "h1.md-h1", "Project");
  const nextHeading = lineWithText(page, "h1.md-h1", "Next");

  await projectHeading.locator(".fold-toggle").click();
  await setCaretAtLineEnd(projectHeading);

  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => await getActiveLineText(page)).toBe("# Next");

  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => await getActiveLineText(page)).toBe("# Project");

  await expect(nextHeading).toBeVisible();
});

test("Ctrl+I cycles folding for the heading under the cursor", async ({ page }) => {
  await openFoldedNote(page);

  const childHeading = lineWithText(page, "h2.md-h2", "Child");
  const grandchildHeading = lineWithText(page, "h3.md-h3", "Grandchild");
  const introLine = lineWithText(page, ".md-text", "intro");
  const childBodyLine = lineWithText(page, ".md-text", "child body");
  const grandBodyLine = lineWithText(page, ".md-text", "grand body");

  await setCaretAtLineEnd(childHeading);
  await page.keyboard.press("Control+I");

  await expect(introLine).toBeVisible();
  await expect(childHeading).toBeVisible();
  await expect(childBodyLine).toBeHidden();
  await expect(grandchildHeading).toBeHidden();
  await expect(grandBodyLine).toBeHidden();

  await page.keyboard.press("Control+I");

  await expect(childBodyLine).toBeVisible();
  await expect(grandchildHeading).toBeVisible();
  await expect(grandBodyLine).toBeHidden();

  await page.keyboard.press("Control+I");

  await expect(childBodyLine).toBeVisible();
  await expect(grandchildHeading).toBeVisible();
  await expect(grandBodyLine).toBeVisible();

  await expectStoredNotes(page, [
    {
      name: "Fold",
      content: foldedNoteContent,
    },
  ]);
});

test("Ctrl+I cycles the closest containing section from a body line", async ({ page }) => {
  await openFoldedNote(page);

  const projectHeading = lineWithText(page, "h1.md-h1", "Project");
  const childHeading = lineWithText(page, "h2.md-h2", "Child");
  const grandchildHeading = lineWithText(page, "h3.md-h3", "Grandchild");
  const introLine = lineWithText(page, ".md-text", "intro");
  const childBodyLine = lineWithText(page, ".md-text", "child body");
  const grandBodyLine = lineWithText(page, ".md-text", "grand body");

  await setCaretAtLineEnd(childBodyLine);
  await page.keyboard.press("Control+I");

  await expect(projectHeading).toBeVisible();
  await expect(introLine).toBeVisible();
  await expect(childHeading).toBeVisible();
  await expect(childBodyLine).toBeHidden();
  await expect(grandchildHeading).toBeHidden();
  await expect(grandBodyLine).toBeHidden();
  await expect(childHeading.locator(".fold-toggle")).toHaveAttribute("aria-label", "Unfold section");

  await page.keyboard.press("Control+I");

  await expect(projectHeading).toBeVisible();
  await expect(introLine).toBeVisible();
  await expect(childHeading).toBeVisible();
  await expect(childBodyLine).toBeVisible();
  await expect(grandchildHeading).toBeVisible();
  await expect(grandBodyLine).toBeHidden();
  await expect(childHeading.locator(".fold-toggle")).toHaveAttribute("aria-label", "Unfold section");

  await page.keyboard.press("Control+I");

  await expect(childBodyLine).toBeVisible();
  await expect(grandchildHeading).toBeVisible();
  await expect(grandBodyLine).toBeVisible();
  await expect(childHeading.locator(".fold-toggle")).toHaveAttribute("aria-label", "Fold section");
});

test("Ctrl+I children state shows parent body and direct child headings", async ({ page }) => {
  await openFoldedNote(page);

  const projectHeading = lineWithText(page, "h1.md-h1", "Project");
  const childHeading = lineWithText(page, "h2.md-h2", "Child");
  const grandchildHeading = lineWithText(page, "h3.md-h3", "Grandchild");
  const introLine = lineWithText(page, ".md-text", "intro");
  const childBodyLine = lineWithText(page, ".md-text", "child body");
  const grandBodyLine = lineWithText(page, ".md-text", "grand body");
  const nextHeading = lineWithText(page, "h1.md-h1", "Next");

  await setCaretAtLineEnd(projectHeading);
  await page.keyboard.press("Control+I");

  await expect(projectHeading).toBeVisible();
  await expect(introLine).toBeHidden();
  await expect(childHeading).toBeHidden();
  await expect(nextHeading).toBeVisible();

  await page.keyboard.press("Control+I");

  await expect(projectHeading).toBeVisible();
  await expect(introLine).toBeVisible();
  await expect(childHeading).toBeVisible();
  await expect(childBodyLine).toBeHidden();
  await expect(grandchildHeading).toBeHidden();
  await expect(grandBodyLine).toBeHidden();
  await expect(nextHeading).toBeVisible();

  await page.keyboard.press("Control+I");

  await expect(childBodyLine).toBeVisible();
  await expect(grandchildHeading).toBeVisible();
  await expect(grandBodyLine).toBeVisible();
});

test("Ctrl+I can open and edit a child section while its parent is showing children", async ({ page }) => {
  const noteId = await createStoredNote(page, {
    name: "Nested Fold",
    content: "# Parent\nparent body\n## Child\nchild body",
  });

  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));
  await expect(page.locator(".editor")).toBeVisible();

  const parentHeading = lineWithText(page, "h1.md-h1", "Parent");
  const childHeading = lineWithText(page, "h2.md-h2", "Child");
  const childBodyLine = lineWithText(page, ".md-text", "child body");

  await setCaretAtLineEnd(parentHeading);
  await page.keyboard.press("Control+I");
  await page.keyboard.press("Control+I");

  await expect(childHeading).toBeVisible();
  await expect(childHeading.locator(".fold-toggle")).toHaveClass(/is-folded/);
  await expect(childBodyLine).toBeHidden();

  await setCaretAtLineEnd(childHeading);
  await page.keyboard.press("Control+I");

  await expect(childHeading.locator(".fold-toggle")).not.toHaveClass(/is-folded/);
  await expect(childBodyLine).toBeVisible();

  await setCaretAtLineEnd(childHeading);
  await page.keyboard.press("Enter");
  await page.keyboard.type("new child line");

  await expect(lineWithText(page, ".md-text", "new child line")).toBeVisible();
  await expectStoredNotes(page, [
    {
      name: "Nested Fold",
      content: "# Parent\nparent body\n## Child\nnew child line\nchild body",
    },
  ]);
});

test("children cycle keeps open parents pointing down and folded child headings pointing right", async ({ page }) => {
  await openFoldedNote(page);

  const childHeading = lineWithText(page, "h2.md-h2", "Child");
  const grandchildHeading = lineWithText(page, "h3.md-h3", "Grandchild");

  await setCaretAtLineEnd(grandchildHeading);
  await page.keyboard.press("Control+I");
  await expect(grandchildHeading.locator(".fold-toggle")).toHaveClass(/is-folded/);

  await setCaretAtLineEnd(childHeading);
  await page.keyboard.press("Control+I");
  await expect(childHeading.locator(".fold-toggle")).toHaveClass(/is-folded/);

  await page.keyboard.press("Control+I");

  await expect(childHeading.locator(".fold-toggle")).not.toHaveClass(/is-folded/);
  await expect(grandchildHeading).toBeVisible();
  await expect(grandchildHeading.locator(".fold-toggle")).toHaveClass(/is-folded/);
});

test("Ctrl+O cycles folding globally", async ({ page }) => {
  await openFoldedNote(page);

  const projectHeading = lineWithText(page, "h1.md-h1", "Project");
  const childHeading = lineWithText(page, "h2.md-h2", "Child");
  const grandchildHeading = lineWithText(page, "h3.md-h3", "Grandchild");
  const nextHeading = lineWithText(page, "h1.md-h1", "Next");
  const introLine = lineWithText(page, ".md-text", "intro");
  const childBodyLine = lineWithText(page, ".md-text", "child body");
  const grandBodyLine = lineWithText(page, ".md-text", "grand body");
  const afterLine = lineWithText(page, ".md-text", "after");

  await setCaretAtLineEnd(introLine);
  await page.keyboard.press("Control+O");

  await expect(projectHeading).toBeVisible();
  await expect(childHeading).toBeHidden();
  await expect(grandchildHeading).toBeHidden();
  await expect(nextHeading).toBeVisible();
  await expect(introLine).toBeHidden();
  await expect(childBodyLine).toBeHidden();
  await expect(grandBodyLine).toBeHidden();
  await expect(afterLine).toBeHidden();

  await page.keyboard.press("Control+O");

  await expect(projectHeading).toBeVisible();
  await expect(childHeading).toBeVisible();
  await expect(grandchildHeading).toBeHidden();
  await expect(nextHeading).toBeVisible();
  await expect(introLine).toBeVisible();
  await expect(childBodyLine).toBeHidden();
  await expect(grandBodyLine).toBeHidden();
  await expect(afterLine).toBeVisible();

  await page.keyboard.press("Control+O");

  await expect(introLine).toBeVisible();
  await expect(childBodyLine).toBeVisible();
  await expect(grandBodyLine).toBeVisible();
  await expect(afterLine).toBeVisible();
});

test("leaf heading cycles directly between folded and open", async ({ page }) => {
  const noteId = await createStoredNote(page, {
    name: "Leaf Fold",
    content: "# Only\nBody",
  });

  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));
  await expect(page.locator(".editor")).toBeVisible();

  const heading = lineWithText(page, "h1.md-h1", "Only");
  const bodyLine = lineWithText(page, ".md-text", "Body");

  await setCaretAtLineEnd(heading);
  await page.keyboard.press("Control+I");
  await expect(bodyLine).toBeHidden();

  await page.keyboard.press("Control+I");
  await expect(bodyLine).toBeVisible();
  await expect(heading.locator(".fold-toggle")).toHaveAttribute("aria-label", "Fold section");

  await page.keyboard.press("Control+I");
  await expect(bodyLine).toBeHidden();
});

test("global leaf heading cycle skips the children phase", async ({ page }) => {
  const noteId = await createStoredNote(page, {
    name: "Leaf Global Fold",
    content: "# First\nFirst body\n# Second\nSecond body",
  });

  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));
  await expect(page.locator(".editor")).toBeVisible();

  const firstBody = lineWithText(page, ".md-text", "First body");
  const secondBody = lineWithText(page, ".md-text", "Second body");

  await setCaretAtLineEnd(firstBody);
  await page.keyboard.press("Control+O");
  await expect(firstBody).toBeHidden();
  await expect(secondBody).toBeHidden();

  await page.keyboard.press("Control+O");
  await expect(firstBody).toBeVisible();
  await expect(secondBody).toBeVisible();

  await page.keyboard.press("Control+O");
  await expect(firstBody).toBeHidden();
  await expect(secondBody).toBeHidden();
});

test("Enter at the end of a folded heading inserts after its hidden section", async ({ page }) => {
  const noteId = await createStoredNote(page, {
    name: "Fold Enter",
    content: "# Only\nhidden",
  });

  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));
  await expect(page.locator(".editor")).toBeVisible();

  const heading = lineWithText(page, "h1.md-h1", "Only");
  const hiddenLine = lineWithText(page, ".md-text", "hidden");

  await heading.locator(".fold-toggle").click();
  await expect(hiddenLine).toBeHidden();

  await setCaretAtLineEnd(heading);
  await page.keyboard.press("Enter");
  await page.keyboard.type("after");

  const afterLine = lineWithText(page, ".md-text", "after");
  await expect(hiddenLine).toBeVisible();
  await expect(afterLine).toBeVisible();
  await expect(heading.locator(".fold-toggle")).toHaveAttribute("aria-label", "Fold section");
  await expect.poll(async () => await getActiveLineText(page)).toBe("after");

  await expectStoredNotes(page, [
    {
      name: "Fold Enter",
      content: "# Only\nhidden\nafter",
    },
  ]);

  await page.reload();
  await expect(page.locator(".editor")).toBeVisible();
  await expect(hiddenLine).toBeVisible();
  await expect(afterLine).toBeVisible();
  await expect(heading.locator(".fold-toggle")).toHaveAttribute("aria-label", "Fold section");

  await heading.locator(".fold-toggle").click();
  await expect(hiddenLine).toBeHidden();
  await expect(afterLine).toBeHidden();
  await expect(heading.locator(".fold-toggle")).toHaveAttribute("aria-label", "Unfold section");
});

test("note actions can fold and unfold all sections without changing content", async ({ page }) => {
  const noteId = await openFoldedNote(page);

  const projectHeading = lineWithText(page, "h1.md-h1", "Project");
  const nextHeading = lineWithText(page, "h1.md-h1", "Next");
  const introLine = lineWithText(page, ".md-text", "intro");
  const childHeading = lineWithText(page, "h2.md-h2", "Child");
  const childBodyLine = lineWithText(page, ".md-text", "child body");
  const afterLine = lineWithText(page, ".md-text", "after");

  await openNoteActions(page);
  await expect(page.getByRole("button", { name: "Toggle Fold", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fold All Sections", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unfold All Sections", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Fold All Sections", exact: true }).click();
  await expectNoteActionsClosed(page);

  await expect(projectHeading).toBeVisible();
  await expect(nextHeading).toBeVisible();
  await expect(introLine).toBeHidden();
  await expect(childHeading).toBeHidden();
  await expect(childBodyLine).toBeHidden();
  await expect(afterLine).toBeHidden();

  await openNoteActions(page);
  await expect(page.getByRole("button", { name: "Toggle Fold", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fold All Sections", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Unfold All Sections", exact: true })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search actions" }).fill("unfold");
  await expect(page.getByRole("button", { name: "Unfold All Sections", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unfold All Sections", exact: true }).click();
  await expectNoteActionsClosed(page);

  await expect(introLine).toBeVisible();
  await expect(childHeading).toBeVisible();
  await expect(childBodyLine).toBeVisible();
  await expect(afterLine).toBeVisible();
  await expect.poll(async () => await getFoldStorageValue(page, noteId)).toBeNull();

  await expectStoredNotes(page, [
    {
      name: "Fold",
      content: foldedNoteContent,
    },
  ]);
});

test("note actions toggle fold cycles all sections", async ({ page }) => {
  await openFoldedNote(page);

  const projectHeading = lineWithText(page, "h1.md-h1", "Project");
  const childHeading = lineWithText(page, "h2.md-h2", "Child");
  const grandchildHeading = lineWithText(page, "h3.md-h3", "Grandchild");
  const nextHeading = lineWithText(page, "h1.md-h1", "Next");
  const introLine = lineWithText(page, ".md-text", "intro");
  const childBodyLine = lineWithText(page, ".md-text", "child body");
  const grandBodyLine = lineWithText(page, ".md-text", "grand body");
  const afterLine = lineWithText(page, ".md-text", "after");

  await openNoteActions(page);
  await expect(page.getByRole("button", { name: "Toggle Fold", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fold All Sections", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Toggle Fold", exact: true }).click();
  await expectNoteActionsClosed(page);

  await expect(projectHeading).toBeVisible();
  await expect(childHeading).toBeHidden();
  await expect(grandchildHeading).toBeHidden();
  await expect(nextHeading).toBeVisible();
  await expect(introLine).toBeHidden();
  await expect(childBodyLine).toBeHidden();
  await expect(grandBodyLine).toBeHidden();
  await expect(afterLine).toBeHidden();

  await openNoteActions(page);
  await expect(page.getByRole("button", { name: "Toggle Fold", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unfold All Sections", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Toggle Fold", exact: true }).click();
  await expectNoteActionsClosed(page);

  await expect(projectHeading).toBeVisible();
  await expect(childHeading).toBeVisible();
  await expect(grandchildHeading).toBeHidden();
  await expect(nextHeading).toBeVisible();
  await expect(introLine).toBeVisible();
  await expect(childBodyLine).toBeHidden();
  await expect(grandBodyLine).toBeHidden();
  await expect(afterLine).toBeVisible();
});

test("note actions keep the cursor near its section when folding and unfolding all sections", async ({ page }) => {
  await openFoldedNote(page);

  const nextHeading = lineWithText(page, "h1.md-h1", "Next");
  const afterLine = lineWithText(page, ".md-text", "after");

  await setCaretAtLineEnd(afterLine);
  await expect.poll(async () => await getActiveLineText(page)).toBe("after");

  await openNoteActions(page);
  await page.getByRole("button", { name: "Fold All Sections", exact: true }).click();
  await expectNoteActionsClosed(page);

  await expect(afterLine).toBeHidden();
  await expect(nextHeading).toBeVisible();
  await expect.poll(async () => await getActiveLineText(page)).toBe("# Next");

  await openNoteActions(page);
  await page.getByRole("button", { name: "Unfold All Sections", exact: true }).click();
  await expectNoteActionsClosed(page);

  await expect(afterLine).toBeVisible();
  await expect.poll(async () => await getActiveLineText(page)).toBe("# Next");
});

test("note actions unfold persisted folded sections on the first click", async ({ page }) => {
  const noteId = await openFoldedNote(page);

  const projectHeading = lineWithText(page, "h1.md-h1", "Project");
  const introLine = lineWithText(page, ".md-text", "intro");
  const childHeading = lineWithText(page, "h2.md-h2", "Child");
  const childBodyLine = lineWithText(page, ".md-text", "child body");

  await projectHeading.locator(".fold-toggle").click();
  await expect(introLine).toBeHidden();

  await page.reload();
  await expect(page.locator(".editor")).toBeVisible();
  await expect(introLine).toBeHidden();
  await expect(childHeading).toBeHidden();

  await openNoteActions(page);
  await expect(page.getByRole("button", { name: "Unfold All Sections", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unfold All Sections", exact: true }).click();
  await expectNoteActionsClosed(page);

  await expect(introLine).toBeVisible();
  await expect(childHeading).toBeVisible();
  await expect(childBodyLine).toBeVisible();
  await expect.poll(async () => await getFoldStorageValue(page, noteId)).toBeNull();
});

test("note actions unfold persisted fold-all state on the first click", async ({ page }) => {
  const noteId = await openFoldedNote(page);

  const projectHeading = lineWithText(page, "h1.md-h1", "Project");
  const introLine = lineWithText(page, ".md-text", "intro");
  const childHeading = lineWithText(page, "h2.md-h2", "Child");
  const childBodyLine = lineWithText(page, ".md-text", "child body");
  const nextHeading = lineWithText(page, "h1.md-h1", "Next");
  const afterLine = lineWithText(page, ".md-text", "after");

  await openNoteActions(page);
  await page.getByRole("button", { name: "Fold All Sections", exact: true }).click();
  await expect(introLine).toBeHidden();
  await expect(childHeading).toBeHidden();
  await expect(afterLine).toBeHidden();

  await page.reload();
  await expect(page.locator(".editor")).toBeVisible();
  await expect(projectHeading).toBeVisible();
  await expect(nextHeading).toBeVisible();
  await expect(introLine).toBeHidden();
  await expect(childHeading).toBeHidden();

  await openNoteActions(page);
  await expect(page.getByRole("button", { name: "Unfold All Sections", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unfold All Sections", exact: true }).click();
  await expectNoteActionsClosed(page);

  await expect(introLine).toBeVisible();
  await expect(childHeading).toBeVisible();
  await expect(childBodyLine).toBeVisible();
  await expect(afterLine).toBeVisible();
  await expect.poll(async () => await getFoldStorageValue(page, noteId)).toBeNull();
});

test("note actions wait for click before unfolding persisted sections", async ({ page }) => {
  const noteId = await createStoredNote(page, {
    name: "Press Fold",
    content: "# Heading\nBody",
  });

  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));
  await expect(page.locator(".editor")).toBeVisible();

  const heading = lineWithText(page, "h1.md-h1", "Heading");
  const bodyLine = lineWithText(page, ".md-text", "Body");

  await heading.locator(".fold-toggle").click();
  await expect(bodyLine).toBeHidden();

  await page.reload();
  await expect(bodyLine).toBeHidden();

  await openNoteActions(page);
  const unfoldAction = page.getByRole("button", { name: "Unfold All Sections", exact: true });
  await expect(unfoldAction).toBeVisible();
  await unfoldAction.dispatchEvent("mousedown", { button: 0, bubbles: true, cancelable: true });

  await expect(page.locator(".modal-content")).toBeVisible();
  await expect(bodyLine).toBeHidden();

  await unfoldAction.dispatchEvent("mouseup", { button: 0, bubbles: true, cancelable: true });
  await unfoldAction.click();
  await expectNoteActionsClosed(page);
  await expect(bodyLine).toBeVisible();
  await expect.poll(async () => await getFoldStorageValue(page, noteId)).toBeNull();
});

test("note actions unfold a single persisted folded section on the first click", async ({ page }) => {
  const noteId = await createStoredNote(page, {
    name: "Single Fold",
    content: "# Heading\nBody",
  });

  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));
  await expect(page.locator(".editor")).toBeVisible();

  const heading = lineWithText(page, "h1.md-h1", "Heading");
  const bodyLine = lineWithText(page, ".md-text", "Body");

  await heading.locator(".fold-toggle").click();
  await expect(bodyLine).toBeHidden();

  await page.reload();
  await expect(bodyLine).toBeHidden();

  await openNoteActions(page);
  await expect(page.getByRole("button", { name: "Unfold All Sections", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unfold All Sections", exact: true }).click();
  await expectNoteActionsClosed(page);

  await expect(bodyLine).toBeVisible();
  await expect.poll(async () => await getFoldStorageValue(page, noteId)).toBeNull();
});

test("note actions unfold persisted folded sections after reopening a note", async ({ page }) => {
  const noteId = await openFoldedNote(page);

  const projectHeading = lineWithText(page, "h1.md-h1", "Project");
  const introLine = lineWithText(page, ".md-text", "intro");
  const childHeading = lineWithText(page, "h2.md-h2", "Child");

  await projectHeading.locator(".fold-toggle").click();
  await expect(introLine).toBeHidden();

  await page.locator(".header-button").first().click();
  await page.getByRole("button", { name: /Fold/ }).click();
  await expect(page.locator(".editor")).toBeVisible();
  await expect(introLine).toBeHidden();
  await expect(childHeading).toBeHidden();

  await openNoteActions(page);
  await expect(page.getByRole("button", { name: "Unfold All Sections", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unfold All Sections", exact: true }).click();
  await expectNoteActionsClosed(page);

  await expect(introLine).toBeVisible();
  await expect(childHeading).toBeVisible();
  await expect.poll(async () => await getFoldStorageValue(page, noteId)).toBeNull();
});
