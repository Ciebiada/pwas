import { expect, test } from "@playwright/test";

test("collapsed search bar fits placeholder via field-sizing", async ({ page }) => {
  await page.goto("/");

  const search = page.getByRole("searchbox", { name: "Search notes" });
  await expect(search).toBeVisible();

  const metrics = await page.evaluate(() => {
    const input = document.querySelector(".notes-search-input") as HTMLInputElement | null;
    if (!input) return null;
    const bar = input.closest(".notes-search") as HTMLElement | null;
    if (!bar) return null;

    const cs = getComputedStyle(input);
    const barCs = getComputedStyle(bar);

    const fieldSizing = cs.fieldSizing;
    const inputClientWidth = input.clientWidth;

    const span = document.createElement("span");
    span.textContent = input.placeholder;
    span.style.font = cs.font;
    span.style.letterSpacing = cs.letterSpacing;
    span.style.whiteSpace = "pre";
    span.style.position = "absolute";
    span.style.visibility = "hidden";
    document.body.appendChild(span);
    const textWidth = span.getBoundingClientRect().width;
    document.body.removeChild(span);

    const origWidth = bar.style.width;
    const origMaxWidth = bar.style.maxWidth;
    bar.style.width = "fit-content";
    bar.style.maxWidth = "none";
    void bar.offsetHeight;
    const naturalWidth = bar.offsetWidth;
    bar.style.width = origWidth;
    bar.style.maxWidth = origMaxWidth;

    return {
      fieldSizing,
      inputClientWidth,
      textWidth,
      naturalWidth,
      actualBarWidth: bar.offsetWidth,
      barPaddingLeft: parseFloat(barCs.paddingLeft) || 0,
      barPaddingRight: parseFloat(barCs.paddingRight) || 0,
      gap: parseFloat(barCs.gap) || 0,
    };
  });

  expect(metrics).not.toBeNull();

  expect(metrics!.textWidth, `text ${metrics!.textWidth} > input ${metrics!.inputClientWidth}`).toBeLessThanOrEqual(
    metrics!.inputClientWidth + 1,
  );

  expect(metrics!.barPaddingRight, "padding-right wrong").toBe(14);
});
