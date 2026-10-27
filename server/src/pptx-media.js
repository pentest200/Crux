import JSZip from "jszip";
import sharp from "sharp";

// This module runs in a separate process, which exits before LibreOffice starts.
sharp.cache(false);
sharp.concurrency(1);
export const MAX_MEDIA_EDGE = 4096;
export const MAX_MEDIA_INPUT_PIXELS = 100_000_000;

export async function optimizePptxMedia(buffer) {
  const zip = await JSZip.loadAsync(buffer, { createFolders: false });
  let changed = false;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !/^ppt\/media\/[^/]+\.(png|jpe?g|webp)$/i.test(entry.name))
      continue;
    const input = await entry.async("nodebuffer");
    const rasterSignature =
      input
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (input[0] === 0xff && input[1] === 0xd8) ||
      (input.subarray(0, 4).toString() === "RIFF" &&
        input.subarray(8, 12).toString() === "WEBP");
    if (!rasterSignature) throw new Error("Invalid embedded raster signature.");
    const image = sharp(input, {
      limitInputPixels: MAX_MEDIA_INPUT_PIXELS,
      sequentialRead: true,
    });
    const metadata = await image.metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format)) {
      throw new Error("Unsupported embedded raster image.");
    }
    if (metadata.pages > 1)
      throw new Error("Animated embedded images are unsupported.");
    if (!metadata.width || !metadata.height)
      throw new Error("Invalid embedded image dimensions.");
    if (Math.max(metadata.width, metadata.height) <= MAX_MEDIA_EDGE) continue;
    let resized = image.keepMetadata().resize({
      width: MAX_MEDIA_EDGE,
      height: MAX_MEDIA_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
    if (metadata.format === "png") resized = resized.png();
    else if (metadata.format === "jpeg")
      resized = resized.jpeg({ quality: 92 });
    else resized = resized.webp({ quality: 92 });
    zip.file(entry.name, await resized.toBuffer());
    changed = true;
  }
  return changed
    ? zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 3 },
      })
    : buffer;
}
