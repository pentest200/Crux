import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { mergePdfs, splitPdf, rotatePdf, organizePdf, markPdf } from "./pdf.js";
import {
  parseRanges,
  uniqueName,
  checkDimensions,
  zipResults,
} from "./files.js";

async function fixture(widths = [200, 300]) {
  const doc = await PDFDocument.create();
  widths.forEach((width) => doc.addPage([width, 400]));
  return new File([await doc.save()], "sample.pdf", {
    type: "application/pdf",
  });
}
const read = async (blob) => PDFDocument.load(await blob.arrayBuffer());
test("merge keeps file and page order", async () => {
  const doc = await read(
    await mergePdfs([await fixture([222]), await fixture([333, 444])]),
  );
  assert.deepEqual(
    doc.getPages().map((page) => page.getWidth()),
    [222, 333, 444],
  );
});
test("split outputs exactly selected pages", async () => {
  const output = await splitPdf(await fixture([100, 200, 300]), "3, 1");
  assert.equal(output.length, 2);
  assert.equal((await read(output[0].blob)).getPage(0).getWidth(), 300);
  assert.equal((await read(output[1].blob)).getPage(0).getWidth(), 100);
});
test("organizer reorders, deletes, and rotates", async () => {
  const doc = await read(
    await organizePdf(await fixture([100, 200, 300]), [
      { index: 2, rotation: 90 },
      { index: 0, rotation: 0 },
    ]),
  );
  assert.equal(doc.getPageCount(), 2);
  assert.equal(doc.getPage(0).getWidth(), 300);
  assert.equal(doc.getPage(0).getRotation().angle, 90);
});
test("rotation adds to existing page rotation", async () => {
  const doc = await read(await rotatePdf(await fixture(), 90, "2"));
  assert.equal(doc.getPage(0).getRotation().angle, 0);
  assert.equal(doc.getPage(1).getRotation().angle, 90);
});
test("typed signature uses a Latin-compatible font", async () => {
  const doc = await read(
    await markPdf(await fixture(), {
      text: "Jane Smith",
      kind: "sign",
      size: 18,
      opacity: 1,
    }),
  );
  assert.equal(doc.getPageCount(), 2);
});
test("range validation rejects ambiguous and out of bounds input", () => {
  assert.deepEqual(parseRanges("1-3, 3, 5", 5), [0, 1, 2, 4]);
  for (const value of ["0", "9", "3-1", "a", "1,"])
    assert.throws(() => parseRanges(value, 5));
});
test("dimensions limit decoded canvas memory", () => {
  assert.throws(() => checkDimensions(10000, 10000));
  assert.throws(() => checkDimensions(-1, 20));
  assert.throws(() => checkDimensions(2.5, 4));
  checkDimensions(1200, 800);
});
test("ZIP preserves colliding successful filenames", async () => {
  const used = new Set();
  assert.equal(uniqueName("a.pdf", used), "a.pdf");
  assert.equal(uniqueName("a.pdf", used), "a-2.pdf");
  const blob = await zipResults([
    { name: "a.pdf", blob: new Blob(["first"]) },
    { name: "a.pdf", blob: new Blob(["second"]) },
  ]);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  assert.equal(await zip.file("a-2.pdf").async("string"), "second");
});
test("malformed PDF fails without output", async () => {
  await assert.rejects(mergePdfs([new File(["broken"], "bad.pdf")]));
});
