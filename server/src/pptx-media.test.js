import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import sharp from "sharp";
import { optimizePptxMedia, MAX_MEDIA_EDGE } from "./pptx-media.js";

async function fixture(width) {
  const image = await sharp({
    create: {
      width,
      height: 1000,
      channels: 4,
      background: { r: 100, g: 180, b: 20, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("ppt/presentation.xml", "<presentation/>");
  zip.file("ppt/slides/slide1.xml", "<slide>unchanged text and layout</slide>");
  zip.file("ppt/slides/_rels/slide1.xml.rels", "<Relationships/>");
  zip.file("ppt/media/image1.png", image);
  return { image, buffer: await zip.generateAsync({ type: "nodebuffer" }) };
}

test("PPTX preparation downsizes only oversized media and retains transparency, slide XML, and original input", async () => {
  const { buffer, image } = await fixture(5000);
  const original = Buffer.from(buffer);
  const optimized = await JSZip.loadAsync(await optimizePptxMedia(buffer));
  const resized = await optimized
    .file("ppt/media/image1.png")
    .async("nodebuffer");
  const dimensions = await sharp(resized).metadata();
  assert.equal(dimensions.width, MAX_MEDIA_EDGE);
  assert.equal(dimensions.height, 819);
  assert.equal(dimensions.hasAlpha, true);
  assert.equal(
    await optimized.file("ppt/slides/slide1.xml").async("string"),
    "<slide>unchanged text and layout</slide>",
  );
  assert.equal(
    await optimized.file("ppt/slides/_rels/slide1.xml.rels").async("string"),
    "<Relationships/>",
  );
  assert.deepEqual(buffer, original);
  assert.notDeepEqual(resized, image);
});

test("PPTX preparation leaves normal-sized images byte-identical and rejects invalid images", async () => {
  const { buffer } = await fixture(1000);
  assert.equal(await optimizePptxMedia(buffer), buffer);
  const zip = await JSZip.loadAsync(buffer);
  zip.file("ppt/media/image1.png", "not an image");
  await assert.rejects(
    optimizePptxMedia(await zip.generateAsync({ type: "nodebuffer" })),
  );
});

test("oversized raster dimensions are rejected from metadata before decoding", async () => {
  const { buffer, image } = await fixture(1000);
  const huge = Buffer.from(image);
  huge.writeUInt32BE(20000, 16);
  huge.writeUInt32BE(10000, 20);
  let crc = 0xffffffff;
  for (const byte of huge.subarray(12, 29)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  huge.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29);
  const zip = await JSZip.loadAsync(buffer);
  zip.file("ppt/media/image1.png", huge);
  await assert.rejects(
    optimizePptxMedia(await zip.generateAsync({ type: "nodebuffer" })),
    /pixel limit/i,
  );
});
