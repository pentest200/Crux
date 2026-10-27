import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { parseRanges, MAX_PIXELS } from "./files.js";
const blobOf = (bytes) =>
  new Blob([Uint8Array.from(bytes).buffer], { type: "application/pdf" });

export async function loadPdf(file) {
  try {
    const doc = await PDFDocument.load(await file.arrayBuffer());
    if (doc.getPageCount() > 300)
      throw new Error("PDFs are limited to 300 pages.");
    return doc;
  } catch (error) {
    if (/encrypt/i.test(error.message))
      throw new Error(
        "This PDF is encrypted. Use Unlock PDF with its password first.",
      );
    throw error;
  }
}
export async function mergePdfs(files) {
  const out = await PDFDocument.create();
  for (const file of files) {
    const input = await loadPdf(file);
    if (out.getPageCount() + input.getPageCount() > 300)
      throw new Error("The merged PDF exceeds the 300-page limit.");
    (await out.copyPages(input, input.getPageIndices())).forEach((page) =>
      out.addPage(page),
    );
  }
  return blobOf(await out.save());
}
export async function splitPdf(file, ranges) {
  const input = await loadPdf(file),
    results = [];
  for (const index of parseRanges(ranges, input.getPageCount())) {
    const out = await PDFDocument.create();
    out.addPage((await out.copyPages(input, [index]))[0]);
    results.push({
      name: `page-${index + 1}.pdf`,
      blob: blobOf(await out.save()),
    });
  }
  return results;
}
export async function organizePdf(file, pages) {
  if (!pages.length) throw new Error("Keep at least one page.");
  const input = await loadPdf(file),
    out = await PDFDocument.create();
  for (const item of pages) {
    const [page] = await out.copyPages(input, [item.index]);
    page.setRotation(degrees((page.getRotation().angle + item.rotation) % 360));
    out.addPage(page);
  }
  return blobOf(await out.save());
}
export async function rotatePdf(file, angle, ranges = "all") {
  const doc = await loadPdf(file);
  for (const index of parseRanges(ranges, doc.getPageCount())) {
    const page = doc.getPage(index);
    page.setRotation(degrees((page.getRotation().angle + Number(angle)) % 360));
  }
  return blobOf(await doc.save());
}
export async function markPdf(file, options) {
  const doc = await loadPdf(file),
    signature = options.kind === "sign";
  const fonts = {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
  };
  const font = await doc.embedFont(
    signature
      ? StandardFonts.TimesRomanItalic
      : fonts[options.font] || StandardFonts.Helvetica,
  );
  const hex = /^#[0-9a-f]{6}$/i.test(options.color || "")
    ? options.color.slice(1)
    : "0f5b52";
  const color = rgb(
    ...[0, 2, 4].map(
      (index) => parseInt(hex.slice(index, index + 2), 16) / 255,
    ),
  );
  const image = options.image
    ? await doc.embedPng(await options.image.arrayBuffer())
    : null;
  for (const index of parseRanges(options.pages || "all", doc.getPageCount())) {
    const page = doc.getPage(index),
      { width, height } = page.getSize();
    const x = Math.min(width - 30, Math.max(0, Number(options.x) || 36)),
      y = Math.min(height - 30, Math.max(0, Number(options.y) || 36));
    if (image) {
      const w = Math.min(Number(options.size) * 6 || 180, width - x),
        h = (w * image.height) / image.width;
      page.drawImage(image, {
        x,
        y,
        width: w,
        height: h,
        opacity: Number(options.opacity),
      });
    } else if (options.shape === "rectangle")
      page.drawRectangle({
        x,
        y,
        width: Math.min(180, width - x),
        height: 60,
        borderWidth: 2,
        borderColor: color,
        opacity: Number(options.opacity),
      });
    else {
      const text = options.text.trim();
      if (!text) throw new Error("Enter text or draw a signature.");
      try {
        page.drawText(text, {
          x,
          y,
          size: Number(options.size) || 24,
          font,
          color,
          opacity: Number(options.opacity),
          rotate: degrees(Number(options.angle) || 0),
          maxWidth: width - x - 12,
          lineHeight: Number(options.size) * 1.2,
        });
      } catch {
        throw new Error(
          "The built-in font supports Latin text. Use an image for other scripts.",
        );
      }
    }
  }
  return blobOf(await doc.save());
}
export async function imagesToPdf(files, options = {}) {
  const out = await PDFDocument.create();
  for (const file of files) {
    const { readImage, renderImage } = await import("./image.js");
    const source = await readImage(file);
    const bytes =
      file.type === "image/webp"
        ? await (
            await renderImage(
              source,
              source.naturalWidth,
              source.naturalHeight,
              "image/png",
            )
          ).blob.arrayBuffer()
        : await file.arrayBuffer();
    const image =
      file.type === "image/jpeg"
        ? await out.embedJpg(bytes)
        : await out.embedPng(bytes);
    let [pw, ph] =
      options.pageSize === "letter"
        ? [612, 792]
        : options.pageSize === "original"
          ? [image.width, image.height]
          : [595.28, 841.89];
    if (options.orientation === "landscape" && pw < ph) [pw, ph] = [ph, pw];
    const margin = Math.min(Number(options.margin) || 0, Math.min(pw, ph) / 4),
      aw = pw - margin * 2,
      ah = ph - margin * 2;
    const ratio =
      options.fit === "cover"
        ? Math.max(aw / image.width, ah / image.height)
        : Math.min(aw / image.width, ah / image.height);
    const page = out.addPage([pw, ph]);
    page.drawImage(image, {
      x: (pw - image.width * ratio) / 2,
      y: (ph - image.height * ratio) / 2,
      width: image.width * ratio,
      height: image.height * ratio,
    });
  }
  return blobOf(await out.save());
}
export async function openRenderedPdf(file) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).href;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
  }).promise;
  if (doc.numPages > 300) {
    await doc.destroy();
    throw new Error("PDFs are limited to 300 pages.");
  }
  return doc;
}
export async function renderPage(doc, index, scale = 1.4) {
  const page = await doc.getPage(index + 1),
    viewport = page.getViewport({ scale });
  if (viewport.width * viewport.height > MAX_PIXELS)
    throw new Error(
      "This page exceeds the rendering memory limit. Lower the render scale.",
    );
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  await page.render({ canvasContext: context, viewport, background: "#ffffff" })
    .promise;
  page.cleanup();
  return canvas;
}
export const encodeCanvas = (canvas, format, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Image encoding failed.")),
      format,
      quality,
    ),
  );
export async function pdfToImages(file, options = {}) {
  const doc = await openRenderedPdf(file),
    results = [];
  try {
    for (const index of parseRanges(options.pages || "all", doc.numPages)) {
      const canvas = await renderPage(doc, index, Number(options.scale) || 1.4);
      const format = options.format || "image/jpeg";
      results.push({
        name: `page-${index + 1}.${format === "image/png" ? "png" : "jpg"}`,
        blob: await encodeCanvas(
          canvas,
          format,
          Number(options.quality) || 0.85,
        ),
      });
      canvas.width = canvas.height = 0;
      if (
        results.reduce((sum, result) => sum + result.blob.size, 0) >
        100 * 1024 * 1024
      )
        throw new Error(
          "Page image outputs exceed 100 MB. Select fewer pages or lower the rendering scale.",
        );
    }
    return results;
  } finally {
    await doc.destroy();
  }
}
export async function compressPdf(file, options) {
  const source = await openRenderedPdf(file),
    output = await PDFDocument.create();
  try {
    for (let i = 0; i < source.numPages; i++) {
      const original = await source.getPage(i + 1),
        size = original.getViewport({ scale: 1 });
      const canvas = await renderPage(source, i, Number(options.scale) || 1);
      const jpeg = await encodeCanvas(
          canvas,
          "image/jpeg",
          Number(options.quality) || 0.65,
        ),
        image = await output.embedJpg(await jpeg.arrayBuffer());
      output.addPage([size.width, size.height]).drawImage(image, {
        x: 0,
        y: 0,
        width: size.width,
        height: size.height,
      });
      canvas.width = canvas.height = 0;
    }
    return blobOf(await output.save());
  } finally {
    await source.destroy();
  }
}
