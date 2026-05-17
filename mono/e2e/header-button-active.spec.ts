import { expect, type Page, test } from "@playwright/test";
import { expectStoredNotes } from "./noteAssertions";
import { createStoredNote } from "./noteStorage";

const expectModalHeightRatio = async (page: Page, min: number, max: number) => {
  await expect
    .poll(async () => {
      const heightRatio = await page
        .locator(".modal-content")
        .evaluate((element) => element.getBoundingClientRect().height / window.innerHeight);
      return heightRatio > min && heightRatio < max;
    })
    .toBe(true);
};

test("three-dot header buttons clear their active state after opening modals on iOS", async ({ page, browserName }) => {
  test.skip(browserName !== "webkit", "This regression is specific to the mobile WebKit path.");

  const noteId = await createStoredNote(page, {
    name: "Regression note",
    content: "Body",
  });

  await page.goto("/");

  const listMoreButton = page.locator(".header .header-button").nth(1);
  await expect(listMoreButton).toBeVisible();

  await listMoreButton.tap();

  await expect(page.getByText("Settings")).toBeVisible();
  await expect(listMoreButton).not.toHaveClass(/activated/);
  await page.locator(".modal-fixed-header .header-button").tap();
  await expect(page.getByText("Settings")).toHaveCount(0);

  await page.goto(`/note/${noteId}`);

  const noteMoreButton = page.locator(".header-button.header-right");
  await expect(noteMoreButton).toBeVisible();

  await noteMoreButton.tap();

  const search = page.getByRole("searchbox", { name: "Search actions" });
  await expect(search).toBeVisible();
  await expect(search).not.toBeFocused();
  await expectModalHeightRatio(page, 0.45, 0.55);
  await search.tap();
  await expect(search).toBeFocused();
  await expectModalHeightRatio(page, 0.7, 0.8);
  await search.evaluate((element: HTMLInputElement) => element.blur());
  await expect(search).not.toBeFocused();
  await expectModalHeightRatio(page, 0.45, 0.55);
  await expect(noteMoreButton).not.toHaveClass(/activated/);
});

test("tapping a contextual note action on iOS returns focus to the editor so typing can continue", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "webkit", "This regression is specific to the mobile WebKit path.");

  const noteId = await createStoredNote(page, {
    name: "Formatting",
    content: "hello world",
  });

  await page.goto(`/note/${noteId}`);

  const editor = page.locator(".editor");
  await expect(editor).toBeVisible();
  await editor.tap();

  const noteMoreButton = page.locator(".header-button.header-right");
  await expect(noteMoreButton).toBeVisible();
  await noteMoreButton.tap();

  const search = page.getByRole("searchbox", { name: "Search actions" });
  await expect(search).toBeVisible();
  await expect(search).toBeFocused();
  await expectModalHeightRatio(page, 0.7, 0.8);
  await page.getByRole("button", { name: "Bold" }).tap();

  await expect
    .poll(async () => await page.evaluate(() => document.activeElement === document.querySelector(".editor")))
    .toBe(true);

  await page.keyboard.type(" test");

  await expectStoredNotes(page, [
    {
      name: "Formatting",
      content: "hello world** test**",
    },
  ]);
});
