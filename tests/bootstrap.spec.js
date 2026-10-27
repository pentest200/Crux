import { test, expect } from "@playwright/test";

test("homepage and tool components mount without runtime errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Your files.*Your device.*Your privacy/ })).toBeVisible();
  await expect(page.locator(".tool-card")).toHaveCount(22);
  await page.locator(".tool-card").filter({ has: page.locator("strong", { hasText: "Sign PDF" }) }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Draw signature")).toBeVisible();
  expect(errors).toEqual([]);
});
