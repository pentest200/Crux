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

test("every tool has a unique direct route that survives refresh", async ({
  page,
}) => {
  expect(new Set(tools.map((tool) => tool.path)).size).toBe(24);
  for (const tool of tools) {
    await page.goto(tool.path);
    await expect(
      page.getByRole("heading", { level: 1, name: tool.name, exact: true }),
    ).toBeVisible();
    await expect(page).toHaveTitle(`${tool.name} | Ghost Files`);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("region", { name: tool.name, exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
      "hidden",
    );
  }
});

test("tool links support browser history and return to the toolkit", async ({
  page,
}) => {
  await page.goto("/");
  const link = page
    .getByRole("link")
    .filter({ has: page.locator("strong", { hasText: "Background remover" }) });
  await expect(link).toHaveAttribute("href", "/tools/background-remover");
  await link.click();
  await expect(page).toHaveURL(/\/tools\/background-remover$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Background remover" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".tool-card")).toHaveCount(24);
  await page.goForward();
  await expect(
    page.getByRole("heading", { level: 1, name: "Background remover" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to tools" }).click();
  await expect(page).toHaveURL(/\/#tools$/);
  await expect(page.locator("#tools")).toBeInViewport();
});

test("unknown URLs show a recovery link and tool pages fit mobile", async ({
  page,
}) => {
  await page.goto("/tools/not-a-real-tool");
  await expect(
    page.getByRole("heading", { level: 1, name: "Page not found" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to tools", exact: true }).click();
  await expect(page).toHaveURL(/\/#tools$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tools/word-to-pdf");
  await expect(
    page.getByRole("heading", { level: 1, name: "Word to PDF" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: /Privacy/ })
    .click();
  await expect(page).toHaveURL(/\/#privacy$/);
});
