const definitions = [
  ["merge", "Merge PDF", "Combine PDFs in your chosen order.", "local", "PDF"],
  [
    "split",
    "Split PDF",
    "Extract selected pages individually or in a ZIP.",
    "local",
    "PDF",
  ],
  [
    "compress-pdf",
    "Compress PDF",
    "Reduce size by rendering pages at your chosen quality.",
    "local",
    "PDF",
  ],
  [
    "pdf-to-word",
    "PDF to Word",
    "Extract selectable text into an editable Word document.",
    "local",
    "W",
  ],
  [
    "pdf-to-powerpoint",
    "PDF to PowerPoint",
    "Create editable text slides from PDF pages.",
    "local",
    "P",
  ],
  [
    "pdf-to-excel",
    "PDF to Excel",
    "Extract positioned text rows into Excel cells.",
    "local",
    "X",
  ],
  [
    "word-to-pdf",
    "Word to PDF",
    "Convert DOCX documents with LibreOffice.",
    "server",
    "W",
  ],
  [
    "powerpoint-to-pdf",
    "PowerPoint to PDF",
    "Convert PPTX presentations with LibreOffice.",
    "server",
    "P",
  ],
  [
    "excel-to-pdf",
    "Excel to PDF",
    "Convert XLSX workbooks with LibreOffice.",
    "server",
    "X",
  ],
  [
    "edit",
    "Edit PDF",
    "Add text, PNG images, and rectangular annotations.",
    "local",
    "T",
  ],
  [
    "pdf-to-jpg",
    "PDF to JPG",
    "Export chosen pages as JPEG or PNG images.",
    "local",
    "JPG",
  ],
  [
    "jpg-to-pdf",
    "JPG to PDF",
    "Arrange JPEG, PNG, and WebP images in a PDF.",
    "local",
    "IMG",
  ],
  [
    "sign",
    "Sign PDF",
    "Draw or type a visible signature on selected pages.",
    "local",
    "Pen",
  ],
  [
    "watermark",
    "Watermark",
    "Stamp text or a PNG image with adjustable opacity.",
    "local",
    "Mark",
  ],
  [
    "rotate",
    "Rotate PDF",
    "Rotate selected PDF pages by 90, 180, or 270 degrees.",
    "local",
    "Turn",
  ],
  [
    "html-to-pdf",
    "HTML to PDF",
    "Convert sanitized HTML content to a downloadable PDF.",
    "local",
    "HTML",
  ],
  [
    "unlock",
    "Unlock PDF",
    "Remove encryption using the known document password.",
    "server",
    "Open",
  ],
  [
    "protect",
    "Protect PDF",
    "Encrypt a PDF with a password using AES-256.",
    "server",
    "Lock",
  ],
  [
    "organize",
    "Organize PDF",
    "Preview, reorder, rotate, and remove pages.",
    "local",
    "Pages",
  ],
  [
    "convert",
    "Image converter",
    "Batch-convert PNG, JPEG, and WebP images.",
    "local",
    "IMG",
  ],
  [
    "resize",
    "Image resizer",
    "Resize with dimensions, percentages, and aspect lock.",
    "local",
    "Size",
  ],
  [
    "compress",
    "Image compressor",
    "Re-encode images and compare actual output sizes.",
    "local",
    "Small",
  ],
];
export const tools = definitions.map(
  ([id, name, description, mode, icon], index) => ({
    id,
    name,
    description,
    mode,
    icon,
    tint: ["#d9f3b0", "#fbe4cf", "#dff2f4", "#efe6ff"][index % 4],
  }),
);
export const imageTools = new Set(["convert", "resize", "compress"]);
export function acceptedTypes(id) {
  if (imageTools.has(id) || id === "jpg-to-pdf")
    return "image/png,image/jpeg,image/webp";
  if (id === "word-to-pdf") return ".docx";
  if (id === "excel-to-pdf") return ".xlsx";
  if (id === "powerpoint-to-pdf") return ".pptx";
  return "application/pdf";
}
