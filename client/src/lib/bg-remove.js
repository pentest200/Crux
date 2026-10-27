import { removeBackground } from "@imgly/background-removal";

/**
 * Remove the background from an image file using an in-browser ML model.
 * Returns a PNG Blob with a transparent background.
 *
 * @param {File} file — JPEG, PNG, or WebP image
 * @param {(p: number) => void} onProgress — progress callback (0–1)
 * @returns {Promise<Blob>} — PNG blob with transparent background
 */
export async function removeBg(file, onProgress) {
  const blob = await removeBackground(file, {
    progress: (key, current, total) => {
      if (onProgress && total > 0) {
        onProgress(Math.min(current / total, 1));
      }
    },
    output: { format: "image/png", quality: 1 },
  });
  return blob;
}

/**
 * Composite a foreground (transparent PNG) onto a solid colour background.
 *
 * @param {Blob} foregroundBlob — the transparent-background PNG
 * @param {string} color — CSS colour string (e.g. "#ff0000")
 * @param {string} outputFormat — "image/png" | "image/jpeg" | "image/webp"
 * @param {number} quality — 0–1 (only for JPEG/WebP)
 * @returns {Promise<Blob>}
 */
export async function compositeOnColor(
  foregroundBlob,
  color,
  outputFormat = "image/png",
  quality = 0.92,
) {
  const img = await loadImageFromBlob(foregroundBlob);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas encode failed."))),
      outputFormat,
      quality,
    ),
  );
}

/**
 * Composite a foreground (transparent PNG) onto a background image,
 * stretching the background to fill.
 *
 * @param {Blob} foregroundBlob — the transparent-background PNG
 * @param {File|Blob} backgroundFile — image file to use as background
 * @param {string} outputFormat — "image/png" | "image/jpeg" | "image/webp"
 * @param {number} quality — 0–1 (only for JPEG/WebP)
 * @returns {Promise<Blob>}
 */
export async function compositeOnImage(
  foregroundBlob,
  backgroundFile,
  outputFormat = "image/png",
  quality = 0.92,
) {
  const [fg, bg] = await Promise.all([
    loadImageFromBlob(foregroundBlob),
    loadImageFromBlob(backgroundFile),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = fg.naturalWidth;
  canvas.height = fg.naturalHeight;
  const ctx = canvas.getContext("2d");
  // Draw background stretched to fit the foreground's dimensions
  ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
  // Overlay the foreground subject
  ctx.drawImage(fg, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas encode failed."))),
      outputFormat,
      quality,
    ),
  );
}

/** Load an HTMLImageElement from a Blob / File */
function loadImageFromBlob(blobOrFile) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blobOrFile);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode the image."));
    };
    img.src = url;
  });
}
