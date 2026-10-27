import { openRenderedPdf } from "./pdf.js";

// Text extraction preserves editable content; it does not infer the original Office layout.
export async function extractPages(file) {
  const pdf = await openRenderedPdf(file),
    pages = [];
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number),
        content = await page.getTextContent(),
        rows = [];
      for (const item of content.items.filter((item) => "str" in item)) {
        const y = item.transform[5];
        let row = rows.find((row) => Math.abs(row.y - y) < 3);
        if (!row) {
          row = { y, items: [] };
          rows.push(row);
        }
        row.items.push({ x: item.transform[4], text: item.str });
      }
      pages.push(
        rows
          .sort((a, b) => b.y - a.y)
          .map((row) =>
            row.items.sort((a, b) => a.x - b.x).map((item) => item.text),
          ),
      );
      page.cleanup();
    }
    if (!pages.some((rows) => rows.some((row) => row.join("").trim())))
      throw new Error(
        "This PDF has no selectable text. Scanned documents need OCR, which is not included.",
      );
    return pages;
  } finally {
    await pdf.destroy();
  }
}
export async function exportOffice(file, kind) {
  const pages = await extractPages(file);
  if (kind === "pdf-to-word") {
    const { Document, Packer, Paragraph, TextRun } = await import("docx");
    const children = pages.flatMap((rows, page) =>
      rows.map(
        (cells, line) =>
          new Paragraph({
            pageBreakBefore: page > 0 && line === 0,
            children: [new TextRun(cells.join(" "))],
          }),
      ),
    );
    return {
      blob: await Packer.toBlob(new Document({ sections: [{ children }] })),
      extension: "docx",
    };
  }
  if (kind === "pdf-to-powerpoint") {
    const { default: PptxGenJS } = await import("pptxgenjs");
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    for (const rows of pages) {
      const lines = rows.map((cells) => cells.join(" "));
      for (let start = 0; start < Math.max(1, lines.length); start += 20) {
        const slide = pptx.addSlide();
        slide.addText(lines.slice(start, start + 20).join("\n"), {
          x: 0.5,
          y: 0.4,
          w: 12.3,
          h: 6.5,
          fontSize: 18,
          color: "123B35",
          breakLine: false,
          fit: "shrink",
          valign: "top",
        });
      }
    }
    return {
      blob: await pptx.write({ outputType: "blob" }),
      extension: "pptx",
    };
  }
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  pages.forEach((rows, index) => {
    const sheet = workbook.addWorksheet(`Page ${index + 1}`);
    rows.forEach((cells) => sheet.addRow(cells));
    sheet.columns.forEach((column) => {
      column.width = 28;
    });
  });
  return {
    blob: new Blob([await workbook.xlsx.writeBuffer()], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    extension: "xlsx",
  };
}
