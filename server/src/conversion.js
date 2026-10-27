import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  rm,
  readdir,
  stat,
  chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { config } from "./config.js";

const runFile = promisify(execFile);
function runConversion(command, args, options) {
  return new Promise((resolve, reject) => {
    const grouped = process.platform !== "win32";
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      detached: grouped,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let killed = false,
      bytes = 0;
    const stop = () => {
      killed = true;
      if (child.pid) {
        try {
          if (grouped) process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {}
      }
    };
    const timer = setTimeout(stop, options.timeout);
    const onAbort = stop;
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) stop();
    const count = (buffer) => {
      bytes += buffer.length;
      if (bytes > options.maxBuffer) stop();
    };
    child.stdout.on("data", count);
    child.stderr.on("data", count);
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    };
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("close", (code, signal) => {
      cleanup();
      if (killed) {
        const error = new Error("timeout or cancellation");
        error.killed = true;
        reject(error);
      } else if (code !== 0) {
        const error = new Error("conversion process failed");
        error.exitCode = code;
        error.signal = signal;
        reject(error);
      } else resolve();
    });
  });
}
export const jobRoot = path.join(tmpdir(), "ghost-files-jobs");
const activeDirectories = new Set();
export const officeKinds = {
  "word-to-pdf": [".docx"],
  "excel-to-pdf": [".xlsx"],
  "powerpoint-to-pdf": [".pptx"],
};
export class ConversionError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}
export async function probeCapabilities() {
  const probe = async (exe, args) => {
    try {
      await runFile(exe, args, { timeout: 5000, windowsHide: true });
      return true;
    } catch {
      return false;
    }
  };
  const [office, qpdf] = await Promise.all([
    config.LIBREOFFICE_ENABLED === "true"
      ? probe(config.LIBREOFFICE_PATH, ["--version"])
      : false,
    probe(config.QPDF_PATH, ["--version"]),
  ]);
  return {
    "word-to-pdf": office,
    "excel-to-pdf": office,
    "powerpoint-to-pdf": office,
    unlock: qpdf,
    protect: qpdf,
  };
}
export async function validateUpload(file, kind) {
  if (!file) throw new ConversionError("Choose a file.", 400);
  if (officeKinds[kind]) {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!officeKinds[kind].includes(extension))
      throw new ConversionError(
        "This tool accepts only its matching DOCX, XLSX, or PPTX format.",
        415,
      );
    const mime = {
      ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".pptx":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }[extension];
    if (
      ![mime, "application/octet-stream", "application/zip"].includes(
        file.mimetype,
      )
    )
      throw new ConversionError(
        "The declared file type does not match the document.",
        415,
      );
    if (file.buffer.length < 4 || file.buffer.readUInt32LE(0) !== 0x04034b50)
      throw new ConversionError("Invalid Office file signature.", 415);
    let zip;
    try {
      zip = await JSZip.loadAsync(file.buffer, { createFolders: false });
    } catch {
      throw new ConversionError("Invalid Office archive.", 415);
    }
    const prefix = {
      ".docx": "word/document.xml",
      ".xlsx": "xl/workbook.xml",
      ".pptx": "ppt/presentation.xml",
    }[extension];
    if (!zip.file("[Content_Types].xml") || !zip.file(prefix))
      throw new ConversionError(
        "The document structure does not match its extension.",
        415,
      );
    let size = 0;
    const entries = Object.values(zip.files);
    if (entries.length > 5000)
      throw new ConversionError("Document contains too many entries.", 413);
    for (const item of entries) {
      size += item._data?.uncompressedSize || 0;
      if (size > 80 * 1024 * 1024)
        throw new ConversionError(
          "Expanded document exceeds the size limit.",
          413,
        );
      if (!item.dir && /vbaProject|embeddings\//i.test(item.name))
        throw new ConversionError(
          "Macros and embedded executable objects are unsupported.",
          415,
        );
      if (item.name.endsWith(".rels")) {
        const content = await item.async("string");
        const externalMatches = content.match(
          /<Relationship[^>]*TargetMode\s*=\s*["']External["'][^>]*>/gi,
        );
        if (externalMatches) {
          for (const rel of externalMatches) {
            const isHyperlink = /Type\s*=\s*["'][^"']*\/hyperlink["']/i.test(
              rel,
            );
            const isSafeWebTarget =
              /Target\s*=\s*["'](?:https?:\/\/|mailto:)/i.test(rel);
            const isDangerousScheme =
              /Target\s*=\s*["'](?:file|smb|gopher|ftp):\/\//i.test(rel);
            if (isDangerousScheme || (!isHyperlink && !isSafeWebTarget)) {
              throw new ConversionError(
                "Documents with dangerous external resource links are unsupported.",
                415,
              );
            }
          }
        }
      }
    }
    return extension;
  }
  if (!["protect", "unlock"].includes(kind))
    throw new ConversionError("Unknown operation.", 404);
  if (
    !["application/pdf", "application/octet-stream"].includes(file.mimetype) ||
    file.buffer.subarray(0, 5).toString() !== "%PDF-"
  )
    throw new ConversionError("Invalid PDF signature or type.", 415);
  return ".pdf";
}
export async function cleanupExpired(
  now = Date.now(),
  ttl = config.JOB_TTL_MS,
) {
  await mkdir(jobRoot, { recursive: true, mode: 0o700 });
  for (const entry of await readdir(jobRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("job-")) continue;
    const target = path.join(jobRoot, entry.name);
    if (
      !activeDirectories.has(target) &&
      now - (await stat(target)).mtimeMs > ttl
    )
      await rm(target, { recursive: true, force: true });
  }
}
let active = false;
export async function convertFile(
  file,
  kind,
  password,
  signal,
  execute = runConversion,
) {
  if (active)
    throw new ConversionError(
      "The conversion worker is busy. Try again shortly.",
      429,
    );
  active = true;
  const startedAt = Date.now();
  const remainingTime = () => {
    const remaining = config.JOB_TIMEOUT_MS - (Date.now() - startedAt);
    if (remaining <= 0)
      throw new ConversionError("Conversion timed out or was cancelled.", 408);
    return remaining;
  };
  let directory;
  try {
    const extension = await validateUpload(file, kind);
    if (
      ["protect", "unlock"].includes(kind) &&
      (!password ||
        password.length > 128 ||
        /[\r\n\0]/.test(password) ||
        password.startsWith("@"))
    )
      throw new ConversionError(
        "Enter a password of 1–128 characters, without line breaks or a leading @.",
        400,
      );
    await mkdir(jobRoot, { recursive: true, mode: 0o700 });
    directory = await mkdtemp(path.join(jobRoot, "job-"));
    await chmod(directory, 0o700);
    activeDirectories.add(directory);
    const input = path.join(directory, `input${extension}`),
      output = path.join(
        directory,
        kind in officeKinds ? "input.pdf" : "output.pdf",
      );
    await writeFile(input, file.buffer, { mode: 0o600 });
    const options = {
      cwd: directory,
      timeout: remainingTime(),
      killSignal: "SIGKILL",
      maxBuffer: 256 * 1024,
      windowsHide: true,
      signal,
      env: { ...process.env, HOME: directory, TMPDIR: directory },
    };
    let officeInput = input;
    if (kind === "powerpoint-to-pdf") {
      officeInput = path.join(directory, "prepared.pptx");
      try {
        await execute(
          process.execPath,
          [
            fileURLToPath(new URL("./pptx-media-worker.js", import.meta.url)),
            input,
            officeInput,
          ],
          options,
        );
      } catch (error) {
        if (error.exitCode === 65)
          throw new ConversionError(
            "A presentation image is invalid, animated, or exceeds the 100-megapixel safety limit.",
            422,
          );
        throw error;
      }
      options.timeout = remainingTime();
    }
    if (kind in officeKinds) {
      await execute(
        config.LIBREOFFICE_PATH,
        [
          `-env:UserInstallation=${pathToFileURL(path.join(directory, "profile")).href}`,
          "--headless",
          "--nologo",
          "--nodefault",
          "--norestore",
          "--convert-to",
          "pdf",
          "--outdir",
          directory,
          officeInput,
        ],
        options,
      );
    } else {
      // qpdf supports argument files, keeping passwords out of the process command line.
      const args =
        kind === "unlock"
          ? [`--password=${password}`, "--decrypt", input, output]
          : ["--encrypt", password, randomUUID(), "256", "--", input, output];
      const argumentFile = path.join(directory, "arguments");
      await writeFile(argumentFile, args.join("\n") + "\n", { mode: 0o600 });
      await execute(config.QPDF_PATH, [`@${argumentFile}`], options);
    }
    // LibreOffice names the PDF after its actual input, including prepared PPTX.
    const resultPath =
      kind === "powerpoint-to-pdf"
        ? path.join(directory, "prepared.pdf")
        : output;
    const info = await stat(resultPath);
    if (info.size > 100 * 1024 * 1024)
      throw new ConversionError("Converted output exceeds 100 MB.", 413);
    const bytes = await readFile(resultPath);
    if (bytes.subarray(0, 5).toString() !== "%PDF-")
      throw new ConversionError("The converter did not produce a valid PDF.");
    return bytes;
  } catch (error) {
    if (error instanceof ConversionError) throw error;
    if (error.killed || error.code === "ABORT_ERR")
      throw new ConversionError("Conversion timed out or was cancelled.", 408);
    if (error.signal === "SIGKILL")
      throw new ConversionError(
        "The conversion worker was interrupted or exceeded available memory. Try a smaller document.",
        503,
      );
    throw new ConversionError(
      "Conversion failed. Check the document or password and try again.",
    );
  } finally {
    try {
      if (directory) await rm(directory, { recursive: true, force: true });
    } finally {
      activeDirectories.delete(directory);
      active = false;
    }
  }
}
