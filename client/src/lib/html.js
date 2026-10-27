import { PDFDocument } from "pdf-lib";

export async function htmlToPdf(html) {
  if (!html.trim()) throw new Error("Enter HTML content first.");
  if (html.length > 100000)
    throw new Error("HTML is limited to 100,000 characters.");
  const { default: DOMPurify } = await import("dompurify");
  const { default: html2canvas } = await import("html2canvas");
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "h1",
      "h2",
      "h3",
      "h4",
      "p",
      "div",
      "span",
      "b",
      "i",
      "strong",
      "em",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "br",
      "hr",
      "blockquote",
      "pre",
      "code",
    ],
    ALLOWED_ATTR: [],
  });
  const root = document.createElement("div");
  root.style.cssText =
    "position:absolute;left:-10000px;top:0;width:794px;padding:38px;background:white;color:#111;font:16px Arial;line-height:1.5;";
  root.innerHTML = clean;
  document.body.appendChild(root);
  try {
    if (root.scrollHeight > 15000)
      throw new Error("HTML content exceeds the 15,000 px rendering limit.");
    const canvas = await html2canvas(root, {
      scale: 1.25,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: false,
      allowTaint: false,
    });
    const out = await PDFDocument.create(),
      sliceHeight = Math.floor((canvas.width * 841.89) / 595.28);
    for (let top = 0; top < canvas.height; top += sliceHeight) {
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.min(sliceHeight, canvas.height - top);
      slice
        .getContext("2d")
        .drawImage(
          canvas,
          0,
          top,
          canvas.width,
          slice.height,
          0,
          0,
          canvas.width,
          slice.height,
        );
      const png = await out.embedPng(slice.toDataURL("image/png"));
      const height = (slice.height / canvas.width) * 595.28;
      out
        .addPage([595.28, 841.89])
        .drawImage(png, { x: 0, y: 841.89 - height, width: 595.28, height });
      slice.width = slice.height = 0;
    }
    canvas.width = canvas.height = 0;
    return new Blob([Uint8Array.from(await out.save()).buffer], {
      type: "application/pdf",
    });
  } finally {
    root.remove();
  }
}
