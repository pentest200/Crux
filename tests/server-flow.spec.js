import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
import PptxGenJS from "pptxgenjs";

test("production PPTX upload converts slides into a downloadable PDF", async ({
  page,
}) => {
  test.skip(
    !process.env.BROWSER_BASE_URL ||
      !process.env.TEST_AUTH_EMAIL ||
      !process.env.TEST_AUTH_PASSWORD,
    "Requires an auth-enabled LibreOffice API and a dedicated test account.",
  );
  const origin = new URL(process.env.BROWSER_BASE_URL).origin;
  const login = await page.request.post("/api/auth/login", {
    headers: { Origin: origin, "x-ghost-auth": "1" },
    data: {
      email: process.env.TEST_AUTH_EMAIL,
      password: process.env.TEST_AUTH_PASSWORD,
    },
  });
  expect(login.ok()).toBe(true);
  const deck = new PptxGenJS();
  for (let index = 1; index <= 2; index++) {
    deck
      .addSlide()
      .addText(`PPTX regression slide ${index}`, {
        x: 1,
        y: 1,
        w: 8,
        h: 1,
        fontSize: 24,
      });
  }
  await page.goto("/tools/powerpoint-to-pdf");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "regression.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: await deck.write({ outputType: "nodebuffer" }),
    });
  await expect(
    page.getByRole("button", { name: "Upload and process" }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: /I approve uploading/ }).check();
  const converted = page.waitForResponse((response) =>
    response.url().endsWith("/api/convert/powerpoint-to-pdf"),
  );
  await page.getByRole("button", { name: "Upload and process" }).click();
  expect((await converted).status()).toBe(200);
  await expect(page.getByRole("status")).toContainText(
    "1 output file(s) ready",
  );
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const output = await downloading;
  expect(
    (
      await PDFDocument.load(await readFile(await output.path()))
    ).getPageCount(),
  ).toBe(2);
});

test("production password upload requires consent and returns a working PDF", async ({
  page,
}) => {
  test.skip(
    !process.env.BROWSER_BASE_URL ||
      !process.env.TEST_AUTH_EMAIL ||
      !process.env.TEST_AUTH_PASSWORD,
    "Requires a running qpdf API and an existing test account through TEST_AUTH_EMAIL/TEST_AUTH_PASSWORD.",
  );
  const login = await page.request.post("/api/auth/login", {
    headers: {
      Origin: new URL(process.env.BROWSER_BASE_URL).origin,
      "x-ghost-auth": "1",
    },
    data: {
      email: process.env.TEST_AUTH_EMAIL,
      password: process.env.TEST_AUTH_PASSWORD,
    },
  });
  expect(login.ok()).toBe(true);
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
