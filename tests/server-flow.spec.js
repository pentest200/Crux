import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";

test("production password upload requires consent and returns a working PDF", async ({
  page,
}) => {
  test.skip(
    !process.env.BROWSER_BASE_URL,
    "Run against Docker to use the real qpdf engine.",
  );
  const original = await PDFDocument.create();
  original.addPage([300, 400]);
  const bytes = Buffer.from(await original.save());
  const uploaded = [];
  page.on("request", (request) => {
    if (request.method() === "POST") uploaded.push(request);
  });
  async function choose(title, file) {
    await page.goto("/");
    await page
      .locator(".tool-card")
      .filter({ has: page.locator("strong", { hasText: title }) })
      .click();
    await page.locator("input[type=file]").first().setInputFiles(file);
  }
  async function result() {
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    return readFile(await (await waiting).path());
  }
  await choose("Protect PDF", {
    name: "sample.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  });
  await page.getByLabel("New PDF password").fill("browser-test-password");
  await expect(
    page.getByRole("button", { name: "Upload and process" }),
  ).toBeDisabled();
  expect(uploaded).toHaveLength(0);
  await page.getByRole("checkbox", { name: /I approve uploading/ }).check();
  await page.getByRole("button", { name: "Upload and process" }).click();
  await expect(page.getByRole("status")).toContainText(
    "1 output file(s) ready",
  );
  const encrypted = await result();
  await expect(PDFDocument.load(encrypted)).rejects.toThrow(/encrypt/i);
  expect(uploaded).toHaveLength(1);
  expect(uploaded[0].headers()["x-ghost-files-consent"]).toBe("approved");
  await choose("Unlock PDF", {
    name: "protected.pdf",
    mimeType: "application/pdf",
    buffer: encrypted,
  });
  await page.getByLabel("Current PDF password").fill("browser-test-password");
  await page.getByRole("checkbox", { name: /I approve uploading/ }).check();
  await page.getByRole("button", { name: "Upload and process" }).click();
  await expect(page.getByRole("status")).toContainText(
    "1 output file(s) ready",
  );
  expect((await PDFDocument.load(await result())).getPageCount()).toBe(1);
});
