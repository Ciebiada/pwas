import { expect, test } from "@playwright/test";
import { expectStoredNotes } from "./noteAssertions";

test("undo and redo restore grouped editor history", async ({ page }) => {
  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.type("Undo");
  await page.keyboard.press("Enter");
  await page.keyboard.type("abc");

  await expectStoredNotes(page, [
    {
      name: "Undo",
      content: "abc",
    },
  ]);

  await page.keyboard.press("ControlOrMeta+Z");

  await expectStoredNotes(page, [
    {
      name: "Undo",
      content: "",
    },
  ]);

  await page.keyboard.press("ControlOrMeta+Shift+Z");

  await expectStoredNotes(page, [
    {
      name: "Undo",
      content: "abc",
    },
  ]);
});

test("note actions show undo and redo when available", async ({ page }) => {
  await page.goto("/new");
  await page.waitForURL(/\/note\/\d+$/);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await editor.click();

  await page.keyboard.type("Actions");
  await page.keyboard.press("Enter");
  await page.keyboard.type("abc");

  await page.locator(".header-button.header-right").click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Redo" })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();

  await expectStoredNotes(page, [
    {
      name: "Actions",
      content: "",
    },
  ]);

  await page.locator(".header-button.header-right").click();
  await expect(page.getByRole("button", { name: "Redo" })).toBeVisible();
  await page.getByRole("button", { name: "Redo" }).click();

  await expectStoredNotes(page, [
    {
      name: "Actions",
      content: "abc",
    },
  ]);
});
