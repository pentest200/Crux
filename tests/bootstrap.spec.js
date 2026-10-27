import { test, expect } from "@playwright/test";
import { tools } from "../client/src/lib/catalog.js";

test("homepage and tool components mount without runtime errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Files in.*Nothing else/ })).toBeVisible();
  await expect(page.locator(".tool-card")).toHaveCount(tools.length);
  await page.locator(".tool-card").filter({ has: page.locator("strong", { hasText: "Sign PDF" }) }).click();
  await expect(page).toHaveURL(/\/tools\/sign-pdf$/);
  await expect(page.getByRole("heading", { name: "Sign PDF", exact: true })).toBeVisible();
  await expect(page.getByLabel("Draw signature")).toBeVisible();
  expect(errors).toEqual([]);
});
