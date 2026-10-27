import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";

async function pdf(width = 300) {
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 2; i++)
    doc
      .addPage([width, 420])
      .drawText(`Sample page ${i + 1}`, { x: 30, y: 300, font, size: 20 });
  return Buffer.from(await doc.save());
}
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
async function choose(page, title, files) {
  await page.goto("/");
  await page
    .locator(".tool-card")
    .filter({ has: page.locator("strong", { hasText: title }) })
    .click();
  await page.locator("input[type=file]").first().setInputFiles(files);
}
async function process(page) {
  await page
    .getByRole("button", { name: "Process locally", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("output file(s) ready", {
    timeout: 90000,
  });
}
async function downloaded(page, index = 0) {
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download", exact: true })
    .nth(index)
    .click();
  const item = await waiting;
  return readFile(await item.path());
}

test("merge real files without any network upload", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ghost-files-auth-user", JSON.stringify({ email: "retired@example.test" }));
    localStorage.setItem("ghost-files-auth-token", "ghost_token_demo");
  });
  const uploads = [];
  page.on("request", (request) => {
    if (request.method() === "POST") uploads.push(request.url());
  });
  await choose(page, "Merge PDF", [
    { name: "a.pdf", mimeType: "application/pdf", buffer: await pdf(300) },
    { name: "b.pdf", mimeType: "application/pdf", buffer: await pdf(400) },
  ]);
  await expect(page.getByText("No account required", { exact: true })).toBeVisible();
  await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0);
  expect(await page.evaluate(() => [
    localStorage.getItem("ghost-files-auth-user"),
    localStorage.getItem("ghost-files-auth-token"),
  ])).toEqual([null, null]);
  await expect(page.locator(".file-row")).toHaveCount(2);
  await process(page);
  const doc = await PDFDocument.load(await downloaded(page));
  expect(doc.getPageCount()).toBe(4);
  expect(doc.getPage(2).getWidth()).toBe(400);
  expect(uploads).toEqual([]);
});
test("split, render images, and package actual ZIP outputs", async ({
  page,
}) => {
  const file = {
    name: "sample.pdf",
    mimeType: "application/pdf",
    buffer: await pdf(),
  };
  await choose(page, "Split PDF", [file]);
  await page.getByLabel("Page ranges").fill("2");
  await process(page);
  expect((await PDFDocument.load(await downloaded(page))).getPageCount()).toBe(
    1,
  );
  await choose(page, "PDF to JPG", [file]);
  await process(page);
  const bytes = await downloaded(page);
  expect(bytes[0]).toBe(255);
  expect(bytes[1]).toBe(216);
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download all as ZIP" }).click();
  const zip = await JSZip.loadAsync(
    await readFile(await (await waiting).path()),
  );
  expect(Object.keys(zip.files)).toHaveLength(2);
});
test("image-to-PDF, resize, and compression create real outputs", async ({
  page,
}) => {
  const file = { name: "pixel.png", mimeType: "image/png", buffer: image };
  await choose(page, "JPG to PDF", [file]);
  await process(page);
  expect((await PDFDocument.load(await downloaded(page))).getPageCount()).toBe(
    1,
  );
  await choose(page, "Image resizer", [file]);
  await page.getByLabel("Width (px)").fill("20");
  await process(page);
  expect((await downloaded(page)).length).toBeGreaterThan(10);
  await choose(page, "Image compressor", [file]);
  await process(page);
  await expect(page.locator(".result small")).toContainText("original");
});
test("HTML converts entered content into a PDF", async ({ page }) => {
  await page.goto("/");
  await page.locator(".tool-card").filter({ hasText: "HTML to PDF" }).click();
  await page
    .getByLabel("HTML content")
    .fill("<h1>Test document</h1><p>Real content</p>");
  await process(page);
  expect(
    (await PDFDocument.load(await downloaded(page))).getPageCount(),
  ).toBeGreaterThan(0);
});
test("PDF-to-Office exports contain editable document parts", async ({
  page,
}) => {
  for (const [title, part] of [
    ["PDF to Word", "word/document.xml"],
    ["PDF to PowerPoint", "ppt/slides/slide1.xml"],
    ["PDF to Excel", "xl/worksheets/sheet1.xml"],
  ]) {
    await choose(page, title, [
      { name: "sample.pdf", mimeType: "application/pdf", buffer: await pdf() },
    ]);
    await process(page);
    const zip = await JSZip.loadAsync(await downloaded(page));
    expect(zip.file(part)).not.toBeNull();
    expect(
      await zip
        .file(title === "PDF to Excel" ? "xl/sharedStrings.xml" : part)
        .async("string"),
    ).toContain("Sample");
  }
});
test("server consent prevents upload and supports mobile layout", async ({
  page,
}) => {
  let posted = false;
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({ json: { server: { protect: true } } }),
  );
  await page.route("**/api/convert/**", (route) => {
    posted = true;
    return route.abort();
  });
  await choose(page, "Protect PDF", [
    { name: "sample.pdf", mimeType: "application/pdf", buffer: await pdf() },
  ]);
  await expect(
    page.getByRole("button", { name: "Upload and process" }),
  ).toBeDisabled();
  expect(posted).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("invalid ranges and batch failures preserve successful downloads", async ({
  page,
}) => {
  await choose(page, "Rotate PDF", [
    { name: "good.pdf", mimeType: "application/pdf", buffer: await pdf() },
    {
      name: "broken.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-broken"),
    },
  ]);
  await process(page);
  await expect(page.locator(".result")).toHaveCount(1);
  await expect(page.locator(".error")).not.toHaveCount(0);
  expect((await PDFDocument.load(await downloaded(page))).getPageCount()).toBe(
    2,
  );
});
test("compression, annotations, signatures, and organizer export valid PDFs", async ({
  page,
}) => {
  const file = {
    name: "sample.pdf",
    mimeType: "application/pdf",
    buffer: await pdf(),
  };
  for (const title of ["Compress PDF", "Edit PDF", "Sign PDF", "Watermark"]) {
    await choose(page, title, [file]);
    await process(page);
    const doc = await PDFDocument.load(await downloaded(page));
    expect(doc.getPageCount()).toBe(2);
  }
  await choose(page, "Organize PDF", [file]);
  await expect(page.locator(".page-tile")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Rotate page 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move page 1 down", exact: true })
    .click();
  await process(page);
  const doc = await PDFDocument.load(await downloaded(page));
  expect(doc.getPage(1).getRotation().angle).toBe(90);
});
test("range errors are visible and recovery succeeds", async ({ page }) => {
  await choose(page, "Split PDF", [
    { name: "sample.pdf", mimeType: "application/pdf", buffer: await pdf() },
  ]);
  await page.getByLabel("Page ranges").fill("999");
  await process(page);
  await expect(page.locator(".error")).toContainText("between 1 and 2");
  await page.getByLabel("Page ranges").fill("1");
  await process(page);
  await expect(page.locator(".result")).toHaveCount(1);
});
test("drawn signature and image-format conversion download real files", async ({
  page,
}) => {
  await choose(page, "Sign PDF", [
    { name: "sample.pdf", mimeType: "application/pdf", buffer: await pdf() },
  ]);
  const box = await page.getByLabel("Draw signature").boundingBox();
  await page.mouse.move(box.x + 20, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 20);
  await page.mouse.move(box.x + 130, box.y + 70);
  await page.mouse.up();
  await process(page);
  expect((await PDFDocument.load(await downloaded(page))).getPageCount()).toBe(
    2,
  );
  await choose(page, "Image converter", [
    { name: "pixel.png", mimeType: "image/png", buffer: image },
  ]);
  await page.getByLabel("Output format").selectOption("image/webp");
  await process(page);
  expect((await downloaded(page)).subarray(0, 4).toString()).toBe("RIFF");
});
test("homepage and workspace remain usable at mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-home.png",
    fullPage: true,
  });
});
