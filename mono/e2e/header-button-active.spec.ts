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
  await expect(async () => {
    const hasClass = await listMoreButton.evaluate((el) => el.classList.contains("activated"));
    expect(hasClass).toBe(false);
  }).toPass();
  await page.locator(".modal-fixed-header .header-button").tap();
  await expect(page.getByText("Settings")).toHaveCount(0);

  await page.goto(`/note/${noteId}`);

  const noteMoreButton = page.locator(".header-button.header-right");
  await expect(noteMoreButton).toBeVisible();

  await noteMoreButton.tap();

  const search = page.getByRole("searchbox", { name: "Search actions" });
  await expect(search).toBeVisible();
  await expect(async () => {
    const hasClass = await noteMoreButton.evaluate((el) => el.classList.contains("activated"));
    expect(hasClass).toBe(false);
  }).toPass();
  await expect(search).not.toBeFocused();
  await expectModalHeightRatio(page, 0.45, 0.55);
  await search.tap();
  await expect(search).toBeFocused();
  await expectModalHeightRatio(page, 0.7, 0.8);
  await search.evaluate((element: HTMLInputElement) => element.blur());
  await expect(search).not.toBeFocused();
  await expectModalHeightRatio(page, 0.45, 0.55);
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

test("tapping the search clear button does not leave the search bar stuck in the activated state on iOS", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "webkit", "This regression is specific to the mobile WebKit path.");
  page.on("console", (msg) => console.log("PAGE:", msg.text()));

  await createStoredNote(page, { name: "Clearable", content: "body" });

  await page.goto("/");

  const searchBar = page.locator(".notes-search");
  const clearButton = page.locator(".notes-search-clear");

  await searchBar.tap();
  await expect(searchBar).toHaveClass(/expanded/);

  const search = page.getByRole("searchbox", { name: "Search notes" });
  await search.fill("clear me");
  await expect(clearButton).toBeVisible();

  // Add raw event listeners to trace what's firing
  await page.evaluate(() => {
    const button = document.querySelector(".notes-search-clear") as HTMLElement;
    button.addEventListener("click", () => console.log("RAW click on X button"), true);
    button.addEventListener("mouseup", () => console.log("RAW mouseup on X button"));
  });

  await clearButton.tap();

  await expect(search).toHaveValue("");
  await expect(clearButton).toHaveCount(0);
  await expect(searchBar).not.toHaveClass(/activated/);
});

test("the press state stays visible while scrolling past the threshold on iOS", async ({ page, browserName }) => {
  test.skip(browserName !== "webkit", "This regression is specific to the mobile WebKit path.");

  await page.goto("/");

  const headerButton = page.locator(".header .header-button").first();
  await expect(headerButton).toBeVisible();

  // Press and hold: dispatch touchstart at the center of the button.
  await page.evaluate(() => {
    const button = document.querySelector(".header .header-button") as HTMLElement;
    const rect = button.getBoundingClientRect();
    const event = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", {
      value: [{ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }],
    });
    button.dispatchEvent(event);
  });

  // The activated class appears after the 30ms activation delay.
  await expect(headerButton).toHaveClass(/activated/);

  // Slide the finger far past the scroll threshold.
  await page.evaluate(() => {
    const button = document.querySelector(".header .header-button") as HTMLElement;
    const event = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", {
      value: [
        { clientX: button.getBoundingClientRect().left + 500, clientY: button.getBoundingClientRect().top + 500 },
      ],
    });
    button.dispatchEvent(event);
  });

  // The press state must stay visible — the user is still touching the screen.
  await expect(headerButton).toHaveClass(/activated/);

  // Release the finger.
  await page.evaluate(() => {
    const button = document.querySelector(".header .header-button") as HTMLElement;
    button.dispatchEvent(new Event("touchend", { bubbles: true, cancelable: true }));
  });

  // The press state is removed on release.
  await expect(headerButton).not.toHaveClass(/activated/);
});
