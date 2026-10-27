export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_PIXELS = 24_000_000;
export const formatBytes = (bytes) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
export function parseRanges(value, max) {
  if (!value.trim() || value.trim().toLowerCase() === "all")
    return Array.from({ length: max }, (_, i) => i);
  const pages = new Set();
  for (const part of value.split(",")) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part.trim());
    if (!match)
      throw new Error("Use page ranges such as 1-3, 5, 8-10, or all.");
    const first = Number(match[1]),
      last = Number(match[2] || match[1]);
    if (first < 1 || last < first || last > max)
      throw new Error(`Page numbers must be between 1 and ${max}.`);
    for (let i = first; i <= last; i++) pages.add(i - 1);
  }
  return [...pages];
}
export function safeName(name) {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .slice(0, 80) || "document"
  );
}
export function uniqueName(name, used) {
  const dot = name.lastIndexOf("."),
    base = dot < 0 ? name : name.slice(0, dot),
    ext = dot < 0 ? "" : name.slice(dot);
  let candidate = name,
    i = 2;
  while (used.has(candidate)) candidate = `${base}-${i++}${ext}`;
  used.add(candidate);
  return candidate;
}
export function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export async function zipResults(results) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip(),
    used = new Set();
  for (const item of results) zip.file(uniqueName(item.name, used), item.blob);
  return zip.generateAsync({ type: "blob" });
}
export function checkDimensions(width, height) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 10000 ||
    height > 10000 ||
    width * height > MAX_PIXELS
  )
    throw new Error(
      "Use whole dimensions up to 10,000 px and at most 24 megapixels.",
    );
}
