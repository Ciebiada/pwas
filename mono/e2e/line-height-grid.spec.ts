import { expect, test } from "@playwright/test";
import { createStoredNote } from "./noteStorage";

const getBodyLineMetrics = async (page: Parameters<typeof test>[0]["page"]) =>
  await page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll<HTMLElement>(".editor .md-line")).slice(1);
    if (lines.length === 0) throw new Error("Expected body lines");

    const rounded = (value: number) => Math.round(value * 100) / 100;
    const heights = lines.map((line) => rounded(line.getBoundingClientRect().height));
    const lineHeights = lines.map((line) => window.getComputedStyle(line).lineHeight);
    const expectedLineHeight = parseFloat(lineHeights[0]);

    if (!Number.isFinite(expectedLineHeight)) {
      throw new Error(`Expected numeric line-height, got ${lineHeights[0]}`);
    }

    return {
      count: lines.length,
      heights,
      lineHeights,
      expectedLineHeight: rounded(expectedLineHeight),
      totalHeight: rounded(heights.reduce((sum, height) => sum + height, 0)),
      expectedTotalHeight: rounded(expectedLineHeight * lines.length),
      texts: lines.map((line) => line.textContent ?? ""),
    };
  });

test("keeps all mixed body lines on the same vertical grid", async ({ page }) => {
  const noteId = await createStoredNote(page, {
    name: "Grid",
    content: ["regular text", "- something", "`inline` something", "`inline`", "```", "sdlkfj", "```"].join("\n"),
  });

  await page.goto(`/note/${noteId}`);
  await page.waitForURL(new RegExp(`/note/${noteId}$`));
  await expect(page.locator(".editor")).toBeVisible();

  const metrics = await getBodyLineMetrics(page);

  expect(metrics.count).toBe(7);
  expect(metrics.texts).toEqual([
    "regular text",
    "- something",
    "`inline` something",
    "`inline`",
    "```",
    "sdlkfj",
    "```",
  ]);

  for (const height of metrics.heights) {
    expect(height).toBeCloseTo(metrics.expectedLineHeight, 1);
  }

  expect(metrics.totalHeight).toBeCloseTo(metrics.expectedTotalHeight, 1);
});
