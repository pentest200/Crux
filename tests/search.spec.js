import { test, expect } from "@playwright/test";
import { tools } from "../client/src/lib/catalog.js";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/status", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({ json: { server: {} } }),
  );
});

async function expectPaintedCards(page, count) {
  await expect(page.locator(".tool-card")).toHaveCount(count);
  // Playwright's toBeVisible ignores opacity; check actual painted state too.
  await expect
    .poll(() =>
      page
        .locator(".tool-card")
        .evaluateAll((cards) =>
          cards.every((card) => Number(getComputedStyle(card).opacity) === 1),
        ),
    )
    .toBe(true);
}

test("search handles whitespace, case, keyboard clearing and reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#tools");
  const search = page.getByRole("searchbox", { name: "Find a tool" });
  await search.fill("   BACKGROUND   remover  ");
  await expectPaintedCards(page, 1);
  await expect(page.getByRole("status")).toHaveText("1 of 24 tools");
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
  await expectPaintedCards(page, tools.length);
  await search.fill("does-not-exist");
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expectPaintedCards(page, tools.length);
  await search.fill("   ");
  await expectPaintedCards(page, tools.length);
  await expect(page.getByRole("status")).toHaveText("24 of 24 tools");
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`clearing a search restores painted, usable results at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/#tools");
    const search = page.getByRole("searchbox", { name: "Find a tool" });
    await search.fill("background");
    await expectPaintedCards(page, 1);
    await search.fill("");
    await expectPaintedCards(page, tools.length);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("cleared-search.png") });
    await search.fill("no-such-tool-987");
    await expect(page.locator(".tool-card")).toHaveCount(0);
    await expect(page.getByText(/No tools match/)).toBeVisible();
    await search.fill("");
    await expectPaintedCards(page, tools.length);
    await search.fill("merge");
    await expectPaintedCards(page, 1);
    await page.locator(".tool-card").click();
    await expect(page).toHaveURL(/\/tools\/merge-pdf$/);
    await page.goBack();
    await expect(search).toHaveValue("merge");
    await expectPaintedCards(page, 1);
    await search.fill("");
    await expectPaintedCards(page, tools.length);
    await page.getByRole("link", { name: /Image converter/ }).click();
    await expect(page).toHaveURL(/\/tools\/image-converter$/);
  });
}
