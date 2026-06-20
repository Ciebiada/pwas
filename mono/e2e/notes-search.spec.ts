import { expect, test } from "@playwright/test";
import { createStoredNote } from "./noteStorage";

const PAGE_SIZE = 30;

test("filters notes by search query in real time", async ({ page }) => {
  await createStoredNote(page, { name: "Apple recipe", content: "Sugar and flour" });
  await createStoredNote(page, { name: "Banana smoothie", content: "Milk and honey" });
  await createStoredNote(page, { name: "Cherry pie", content: "Apples and cherries" });

  await page.goto("/");

  const search = page.getByRole("searchbox", { name: "Search notes" });
  await expect(search).toBeVisible();

  await expect(page.locator(".note-item")).toHaveCount(3);

  await search.fill("apple");
  await expect(page.locator(".note-item")).toHaveCount(2);

  await search.fill("banana");
  await expect(page.locator(".note-item")).toHaveCount(1);
  await expect(page.locator(".note-item")).toContainText("Banana smoothie");

  await search.fill("");
  await expect(page.locator(".note-item")).toHaveCount(3);
});

test("shows no notes found when search has no matches", async ({ page }) => {
  await createStoredNote(page, { name: "Hello", content: "World" });

  await page.goto("/");

  const search = page.getByRole("searchbox", { name: "Search notes" });
  await search.fill("zzz");
  await expect(page.locator(".note-item")).toHaveCount(0);
  await expect(page.getByText("No notes found")).toBeVisible();

  await search.fill("");
  await expect(page.locator(".note-item")).toHaveCount(1);
});

test("paginates notes with infinite scroll", async ({ page }) => {
  const total = PAGE_SIZE + 5;
  for (let i = 0; i < total; i++) {
    await createStoredNote(page, { name: `Note ${String(i).padStart(3, "0")}`, content: "x" });
  }

  await page.goto("/");

  await expect(page.locator(".note-item")).toHaveCount(PAGE_SIZE);

  await page.locator(".notes-list-sentinel").scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    document.querySelector(".page")?.scrollTo(0, document.body.scrollHeight);
  });

  await expect(page.locator(".note-item")).toHaveCount(total);
});
