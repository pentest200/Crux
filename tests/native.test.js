import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { Document, Packer, Paragraph } from "docx";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:4180/api";
const mimes = {
  "word-to-pdf":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "excel-to-pdf":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "powerpoint-to-pdf":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  protect: "application/pdf",
  unlock: "application/pdf",
};
async function convert(kind, bytes, extension, password = "") {
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: mimes[kind] }),
    `input.${extension}`,
  );
  const response = await fetch(`${base}/convert/${kind}`, {
    method: "POST",
    headers: {
      "x-ghost-files-consent": "approved",
      "x-document-password": Buffer.from(password).toString("base64"),
    },
    body: form,
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.match(response.headers.get("content-type"), /application\/pdf/);
  return Buffer.from(await response.arrayBuffer());
}
test(
  "real LibreOffice converts DOCX, XLSX, and PPTX",
  { timeout: 240000 },
  async () => {
    const caps = await (await fetch(`${base}/capabilities`)).json();
    assert.equal(caps.server["word-to-pdf"], true);
    const docx = await Packer.toBuffer(
      new Document({
        sections: [{ children: [new Paragraph("Ghost Files conversion test")] }],
      }),
    );
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Test").addRow(["Ghost Files", "conversion"]);
    const xlsx = await workbook.xlsx.writeBuffer();
    const presentation = new PptxGenJS();
    presentation
      .addSlide()
      .addText("Ghost Files conversion test", { x: 1, y: 1, w: 6, h: 1 });
    const pptx = await presentation.write({ outputType: "nodebuffer" });
    for (const [kind, bytes, extension] of [
      ["word-to-pdf", docx, "docx"],
      ["excel-to-pdf", xlsx, "xlsx"],
      ["powerpoint-to-pdf", pptx, "pptx"],
    ]) {
      const doc = await PDFDocument.load(await convert(kind, bytes, extension));
      assert.ok(doc.getPageCount() > 0);
    }
  },
);
test(
  "real qpdf encrypts, rejects wrong passwords, and decrypts",
  { timeout: 120000 },
  async () => {
    const original = await PDFDocument.create();
    original.addPage([300, 400]);
    const bytes = await original.save();
    const encrypted = await convert("protect", bytes, "pdf", "test-password");
    await assert.rejects(PDFDocument.load(encrypted), /encrypt/i);
    const decrypted = await convert(
      "unlock",
      encrypted,
      "pdf",
      "test-password",
    );
    assert.equal((await PDFDocument.load(decrypted)).getPageCount(), 1);
    const form = new FormData();
    form.append(
      "file",
      new Blob([encrypted], { type: "application/pdf" }),
      "locked.pdf",
    );
    const bad = await fetch(`${base}/convert/unlock`, {
      method: "POST",
      headers: {
        "x-ghost-files-consent": "approved",
        "x-document-password": Buffer.from("wrong").toString("base64"),
      },
      body: form,
    });
    assert.equal(bad.status, 422);
  },
);
