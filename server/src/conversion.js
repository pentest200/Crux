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
import { pathToFileURL } from "node:url";
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
    child.once("close", (code) => {
      cleanup();
      if (killed) {
        const error = new Error("timeout or cancellation");
        error.killed = true;
        reject(error);
      } else if (code !== 0) reject(new Error("conversion process failed"));
      else resolve();
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
      if (
        item.name.endsWith(".rels") &&
        /TargetMode\s*=\s*["']External/i.test(await item.async("string"))
      )
        throw new ConversionError(
          "Documents with external resource links are unsupported.",
          415,
        );
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
      timeout: config.JOB_TIMEOUT_MS,
      killSignal: "SIGKILL",
      maxBuffer: 256 * 1024,
      windowsHide: true,
      signal,
      env: { ...process.env, HOME: directory, TMPDIR: directory },
    };
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
          input,
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
    const info = await stat(output);
    if (info.size > 100 * 1024 * 1024)
      throw new ConversionError("Converted output exceeds 100 MB.", 413);
    const bytes = await readFile(output);
    if (bytes.subarray(0, 5).toString() !== "%PDF-")
      throw new ConversionError("The converter did not produce a valid PDF.");
    return bytes;
  } catch (error) {
    if (error instanceof ConversionError) throw error;
    if (error.killed || error.code === "ABORT_ERR")
      throw new ConversionError("Conversion timed out or was cancelled.", 408);
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
