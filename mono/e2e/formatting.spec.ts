import { expect, test } from "@playwright/test";
import { expectStoredNotes } from "./noteAssertions";

test("auto-pairs emphasis markers and allows exiting italic text with ArrowRight", async ({ page }) => {
  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.type("Formatting");
  await page.keyboard.press("Enter");
  await page.keyboard.type("*");

  await expectStoredNotes(page, [
    {
      name: "Formatting",
      content: "**",
    },
  ]);

  await page.keyboard.type("italic");

  await expectStoredNotes(page, [
    {
      name: "Formatting",
      content: "*italic*",
    },
  ]);

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await page.keyboard.type("regular");

  await expectStoredNotes(page, [
    {
      name: "Formatting",
      content: "*italic* regular",
    },
  ]);
});

test("pressing star twice creates bold markers and ArrowRight exits the closing pair", async ({ page }) => {
  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.type("Formatting");
  await page.keyboard.press("Enter");
  await page.keyboard.type("*");
  await page.keyboard.type("*");
  await page.keyboard.type("bold");

  await expectStoredNotes(page, [
    {
      name: "Formatting",
      content: "**bold**",
    },
  ]);

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await page.keyboard.type("regular");

  await expectStoredNotes(page, [
    {
      name: "Formatting",
      content: "**bold** regular",
    },
  ]);
});

test("backspace removes an empty auto-paired emphasis marker", async ({ page }) => {
  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.type("Formatting");
  await page.keyboard.press("Enter");
  await page.keyboard.type("*");

  await expectStoredNotes(page, [
    {
      name: "Formatting",
      content: "**",
    },
  ]);

  await page.keyboard.press("Backspace");

  await expectStoredNotes(page, [
    {
      name: "Formatting",
      content: "",
    },
  ]);
});

test("backtick creates an inline code pair", async ({ page }) => {
  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
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

  await page.keyboard.type("code");

  await expectStoredNotes(page, [
    {
      name: "Formatting",
      content: "`code`",
    },
  ]);
});

test("backspace removes an empty auto-paired inline code marker", async ({ page }) => {
  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
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

  await page.keyboard.press("Backspace");

  await expectStoredNotes(page, [
    {
      name: "Formatting",
      content: "",
    },
  ]);
});

test("empty inline code pair is rendered as inline code", async ({ page }) => {
  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.type("Formatting");
  await page.keyboard.press("Enter");
  await page.keyboard.type("`");
  await page.keyboard.press("ArrowRight");

  await expectStoredNotes(page, [
    {
      name: "Formatting",
      content: "``",
    },
  ]);

  const inlineCode = page.locator(".md-inline-code");
  await expect(inlineCode).toHaveCount(1);

  await expect
    .poll(
      async () =>
        await inlineCode.evaluate((element) => window.getComputedStyle(element).backgroundColor !== "rgba(0, 0, 0, 0)"),
    )
    .toBe(true);
});

test("italic can be exited inside a list item without resetting the cursor to line start", async ({ page }) => {
  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.type("Formatting");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- something ");
  await page.keyboard.type("*");
  await page.keyboard.type("italic");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await page.keyboard.type("regular");

  await expectStoredNotes(page, [
    {
      name: "Formatting",
      content: "- something *italic* regular",
    },
  ]);
});

test("ArrowLeft can move back inside an inline code pair after exiting it", async ({ page }) => {
  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.type("Formatting");
  await page.keyboard.press("Enter");
  await page.keyboard.type("`");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await page.keyboard.type("a");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.type("something");

  await expectStoredNotes(page, [
    {
      name: "Formatting",
      content: "`something` a",
    },
  ]);
});
