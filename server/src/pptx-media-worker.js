import { readFile, writeFile } from "node:fs/promises";
import { optimizePptxMedia } from "./pptx-media.js";

try {
  const input = await readFile(process.argv[2]);
  const output = await optimizePptxMedia(input);
  await writeFile(process.argv[3], output, { mode: 0o600 });
} catch {
  // Never print document contents, image metadata, paths, or original filenames.
  process.exitCode = 65;
}
