import { expect, test } from "@playwright/test";
import { createStoredNote } from "./noteStorage";

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

  await expect(page.getByText("Note Actions")).toBeVisible();
  await expect(noteMoreButton).not.toHaveClass(/activated/);
});
