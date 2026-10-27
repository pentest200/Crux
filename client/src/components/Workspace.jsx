import React, { useEffect, useRef, useState } from "react";
import { acceptedTypes, imageTools } from "../lib/catalog.js";
import {
  MAX_BYTES,
  formatBytes,
  safeName,
  download,
  zipResults,
} from "../lib/files.js";
import PdfPreview from "./PdfPreview.jsx";
import Signature from "./Signature.jsx";

const defaults = {
  pages: "all",
  text: "Ghost Files",
  size: 24,
  x: 36,
  y: 36,
  opacity: 0.5,
  angle: 0,
  shape: "text",
  font: "regular",
  color: "#0f5b52",
  rotation: 90,
  format: "image/jpeg",
  quality: 0.75,
  scale: 1.4,
  width: 1200,
  height: 800,
  percent: 100,
  lock: true,
  usePercent: false,
  pageSize: "a4",
  orientation: "portrait",
  margin: 28,
  fit: "contain",
};
function Field({ label, children }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}
export default function Workspace({ tool, onClose, user, onRequireAuth }) {
  const [files, setFiles] = useState([]),
    [options, setOptions] = useState(defaults),
    [results, setResults] = useState([]),
    [status, setStatus] = useState(""),
    [errors, setErrors] = useState([]),
    [busy, setBusy] = useState(false);

  const handleDownload = (downloadAction) => {
    if (!user) {
      if (onRequireAuth) {
        onRequireAuth(downloadAction);
      }
      return;
    }
    downloadAction();
  };
  const [consent, setConsent] = useState(false),
    [password, setPassword] = useState(""),
    [capabilities, setCapabilities] = useState(null),
    [capError, setCapError] = useState("");
  const [html, setHtml] = useState(
      "<h1>Hello from Ghost Files</h1><p>This document is generated in your browser.</p>",
    ),
    [markImage, setMarkImage] = useState(null),
    [pages, setPages] = useState([]),
    [pageCount, setPageCount] = useState(0),
    [preview, setPreview] = useState(null);
  const input = useRef(null),
    modal = useRef(null),
    controller = useRef(null),
    original = useRef({ width: 1200, height: 800 }),
    mounted = useRef(true);
  const server = tool.mode === "server",
    isImage = imageTools.has(tool.id),
    imageInput = isImage || tool.id === "jpg-to-pdf";
  const set = (key, value) => setOptions((old) => ({ ...old, [key]: value }));
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement;
    modal.current.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      mounted.current = false;
      controller.current?.abort();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (!files[0] || !imageInput) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(files[0]);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [files, imageInput]);
  useEffect(() => {
    let stopped = false;
    setPageCount(0);
    setPages([]);
    if (!files[0]) return;
    (async () => {
      try {
        if (imageInput) {
          const { readImage } = await import("../lib/image.js");
          const image = await readImage(files[0]);
          if (!stopped) {
            original.current = {
              width: image.naturalWidth,
              height: image.naturalHeight,
            };
            setOptions((old) => ({ ...old, ...original.current }));
          }
        } else if (!server) {
          const { loadPdf } = await import("../lib/pdf.js");
          const pdf = await loadPdf(files[0]);
          if (!stopped) {
            setPageCount(pdf.getPageCount());
            setPages(
              pdf
                .getPageIndices()
                .map((index) => ({ index, rotation: 0, selected: false })),
            );
          }
        }
      } catch (error) {
        if (!stopped) setErrors((current) => [...current, error.message]);
      }
    })();
    return () => {
      stopped = true;
    };
  }, [files[0], imageInput, server]);
  async function checkCapabilities() {
    setCapError("");
    try {
      const response = await fetch("/api/capabilities");
      if (!response.ok) throw new Error();
      const data = await response.json();
      setCapabilities(data.server);
    } catch {
      setCapabilities({});
      setCapError(
        "The conversion API is unreachable. Start the API or Docker Compose, then retry.",
      );
    }
  }
  useEffect(() => {
    if (server) checkCapabilities();
  }, [server]);
  async function addFiles(list) {
    if (busy) return;
    const accepted = [],
      failures = [];
    for (const file of Array.from(list)) {
      if (files.length + accepted.length >= 20) {
        failures.push("Maximum 20 files per session.");
        break;
      }
      if (file.size > (server ? 25 * 1024 * 1024 : MAX_BYTES)) {
        failures.push(
          `${file.name}: exceeds the ${server ? 25 : 50} MB limit.`,
        );
        continue;
      }
      if (!file.size) {
        failures.push(`${file.name}: empty file.`);
        continue;
      }
      if (
        imageInput &&
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      ) {
        failures.push(`${file.name}: choose JPEG, PNG, or WebP.`);
        continue;
      }
      if (
        server &&
        ["word-to-pdf", "excel-to-pdf", "powerpoint-to-pdf"].includes(
          tool.id,
        ) &&
        !file.name.toLowerCase().endsWith(acceptedTypes(tool.id))
      ) {
        failures.push(`${file.name}: expected ${acceptedTypes(tool.id)}.`);
        continue;
      }
      if (!imageInput && (!server || ["protect", "unlock"].includes(tool.id))) {
        const signature = new TextDecoder().decode(
          await file.slice(0, 5).arrayBuffer(),
        );
        if (signature !== "%PDF-") {
          failures.push(`${file.name}: invalid PDF signature.`);
          continue;
        }
      }
      accepted.push(file);
    }
    const combined =
      tool.id === "organize" && accepted.length
        ? accepted.slice(0, 1)
        : [...files, ...accepted];
    if (combined.reduce((sum, file) => sum + file.size, 0) > 150 * 1024 * 1024)
      return setErrors([
        "Session size exceeds 150 MB. Remove files before adding more.",
      ]);
    setFiles(combined);
    setResults([]);
    setErrors(failures);
    setConsent(false);
  }
  function updateDimension(key, value) {
    const next = Number(value),
      other = key === "width" ? "height" : "width";
    setOptions((old) => ({
      ...old,
      [key]: next,
      ...(old.lock
        ? {
            [other]: Math.round(
              (next * original.current[other]) / original.current[key],
            ),
          }
        : {}),
    }));
  }
  function moveFile(index, step) {
    setFiles((old) => {
      const copy = [...old],
        next = index + step;
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  }
  function movePage(index, step) {
    setPages((old) => {
      const copy = [...old],
        next = index + step;
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  }
  function close() {
    onClose();
  }
  function keydown(event) {
    if (event.key === "Escape") close();
    if (event.key === "Tab") {
      const controls = [
        ...modal.current.querySelectorAll(
          "button:not(:disabled), input:not(:disabled), textarea, select, a[href]",
        ),
      ].filter((element) => element.offsetParent !== null);
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        last?.focus();
        event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        first?.focus();
        event.preventDefault();
      }
    }
  }
  async function run() {
    if (busy) return;
    setErrors([]);
    setStatus("");
    setResults([]);
    if (tool.id !== "html-to-pdf" && !files.length)
      return setErrors(["Choose at least one file."]);
    if (tool.id === "merge" && files.length < 2)
      return setErrors(["Choose at least two PDFs to merge."]);
    if (server && (!consent || !capabilities?.[tool.id]))
      return setErrors([
        "Approve the temporary upload and check that the conversion engine is available.",
      ]);
    if (
      ["protect", "unlock"].includes(tool.id) &&
      (!password ||
        password.length > 128 ||
        /[\r\n\0]/.test(password) ||
        password.startsWith("@"))
    )
      return setErrors([
        "Enter a password of 1–128 characters, without line breaks or a leading @.",
      ]);
    controller.current = new AbortController();
    const signal = controller.current.signal;
    setBusy(true);
    const output = [],
      failed = [];
    try {
      const pdf = await import("../lib/pdf.js");
      if (tool.id === "html-to-pdf") {
        const { htmlToPdf } = await import("../lib/html.js");
        output.push({ name: "ghost-files-html.pdf", blob: await htmlToPdf(html) });
      } else if (tool.id === "merge")
        output.push({
          name: "ghost-files-merged.pdf",
          blob: await pdf.mergePdfs(files),
        });
      else if (tool.id === "jpg-to-pdf")
        output.push({
          name: "ghost-files-images.pdf",
          blob: await pdf.imagesToPdf(files, options),
        });
      else if (tool.id === "organize")
        output.push({
          name: "ghost-files-organized.pdf",
          blob: await pdf.organizePdf(files[0], pages),
        });
      else
        for (let index = 0; index < files.length; index++) {
          if (signal.aborted) break;
          const file = files[index],
            prefix = `${index + 1}-${safeName(file.name)}`;
          const resultStart = output.length;
          setStatus(`Processing file ${index + 1} of ${files.length}...`);
          try {
            if (server) {
              const body = new FormData();
              body.append("file", file);
              const headers = { "x-ghost-files-consent": "approved" };
              if (password)
                headers["x-document-password"] = btoa(
                  String.fromCharCode(...new TextEncoder().encode(password)),
                );
              const response = await fetch(`/api/convert/${tool.id}`, {
                method: "POST",
                headers,
                body,
                signal,
              });
              if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || "Server conversion failed.");
              }
              output.push({
                name: `${prefix}-${tool.id}.pdf`,
                blob: await response.blob(),
              });
            } else if (tool.id === "split")
              output.push(
                ...(await pdf.splitPdf(file, options.pages)).map((result) => ({
                  ...result,
                  name: `${prefix}-${result.name}`,
                })),
              );
            else if (tool.id === "pdf-to-jpg")
              output.push(
                ...(await pdf.pdfToImages(file, options)).map((result) => ({
                  ...result,
                  name: `${prefix}-${result.name}`,
                })),
              );
            else if (tool.id.startsWith("pdf-to-")) {
              const { exportOffice } = await import("../lib/office.js");
              const result = await exportOffice(file, tool.id);
              output.push({
                name: `${prefix}.${result.extension}`,
                blob: result.blob,
              });
            } else if (tool.id === "rotate")
              output.push({
                name: `${prefix}-rotated.pdf`,
                blob: await pdf.rotatePdf(
                  file,
                  options.rotation,
                  options.pages,
                ),
              });
            else if (["edit", "sign", "watermark"].includes(tool.id))
              output.push({
                name: `${prefix}-${tool.id}.pdf`,
                blob: await pdf.markPdf(file, {
                  ...options,
                  kind: tool.id,
                  image: markImage,
                }),
              });
            else if (tool.id === "compress-pdf") {
              const blob = await pdf.compressPdf(file, options);
              output.push({
                name: `${prefix}-compressed.pdf`,
                blob,
                original: file.size,
              });
            } else if (isImage) {
              const { readImage, renderImage } =
                  await import("../lib/image.js"),
                image = await readImage(file);
              let width = image.naturalWidth,
                height = image.naturalHeight;
              if (tool.id === "resize") {
                width = options.usePercent
                  ? Math.round((width * options.percent) / 100)
                  : Number(options.width);
                height = options.usePercent
                  ? Math.round((height * options.percent) / 100)
                  : options.lock
                    ? Math.round(
                        (width * image.naturalHeight) / image.naturalWidth,
                      )
                    : Number(options.height);
              }
              const result = await renderImage(
                image,
                width,
                height,
                options.format,
                Number(options.quality),
              );
              const ext =
                options.format === "image/jpeg"
                  ? "jpg"
                  : options.format.split("/")[1];
              output.push({
                name: `${prefix}-${tool.id}.${ext}`,
                blob: result.blob,
                original: file.size,
              });
            }
            if (
              output.reduce((total, item) => total + item.blob.size, 0) >
              150 * 1024 * 1024
            ) {
              output.splice(resultStart);
              throw new Error(
                "The result batch exceeds 150 MB. Use fewer files or a lower rendering scale. Earlier results are still available.",
              );
            }
          } catch (error) {
            failed.push(
              `${file.name}: ${error.name === "AbortError" ? "cancelled" : error.message}`,
            );
          }
          if (mounted.current) {
            setResults([...output]);
            setErrors([...failed]);
          }
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
    } catch (error) {
      failed.push(error.message);
    } finally {
      if (mounted.current) {
        setResults(output);
        setErrors(failed);
        setBusy(false);
        setStatus(
          signal.aborted
            ? "Cancelled. Completed results remain available."
            : `${output.length} output file(s) ready. ${failed.length} error(s).`,
        );
      }
      setPassword("");
    }
  }
  const marking = ["edit", "sign", "watermark"].includes(tool.id);
  return (
    <div className="modal-backdrop">
      <section
        className="workspace"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tool-title"
        tabIndex="-1"
        ref={modal}
        onKeyDown={keydown}
      >
        <button className="back" onClick={close}>
          ← Back to tools
        </button>
        <div className="workspace-head">
          <div>
            <div className="kicker">
              {server
                ? "Temporary server processing"
                : "Processed on your device"}
            </div>
            <h2 id="tool-title">{tool.name}</h2>
            <p>{tool.description}</p>
          </div>
        </div>
        <div className="workspace-grid">
          <div className="work-card">
            <div className="privacy-banner">
              <span>
                <b>
                  {server
                    ? "Temporary server processing"
                    : "Processed on your device"}
                </b>
                {server
                  ? "The selected file and password (if entered) will be transferred to your configured server after approval. The server can access them during conversion; temporary files are deleted after completion or failure."
                  : "Your selected files stay in this browser during this operation."}
              </span>
            </div>
            {tool.id === "html-to-pdf" ? (
              <label className="full-field">
                HTML content
                <textarea
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  rows="10"
                />
                <small>
                  Text, headings, lists, and tables are supported. Scripts,
                  styles, images, and external links are removed. Output is
                  rendered as page images.
                </small>
              </label>
            ) : (
              <>
                <input
                  className="hidden"
                  type="file"
                  ref={input}
                  multiple={tool.id !== "organize"}
                  accept={acceptedTypes(tool.id)}
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  disabled={busy}
                  className="work-drop"
                  onClick={() => input.current.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    addFiles(e.dataTransfer.files);
                  }}
                >
                  <b>Drop files or browse</b>
                  <span>
                    {acceptedTypes(tool.id)} · {server ? "25" : "50"} MB per
                    file · 20 files per session
                  </span>
                </button>
                <div className="file-list">
                  {files.map((file, index) => (
                    <div className="file-row" key={`${file.name}-${index}`}>
                      <span>
                        {file.name}
                        <small>{formatBytes(file.size)}</small>
                      </span>
                      <button
                        disabled={busy || index === 0}
                        aria-label={`Move file ${index + 1} up`}
                        onClick={() => moveFile(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        disabled={busy || index === files.length - 1}
                        aria-label={`Move file ${index + 1} down`}
                        onClick={() => moveFile(index, 1)}
                      >
                        ↓
                      </button>
                      <button
                        disabled={busy}
                        aria-label={`Remove file ${index + 1}`}
                        onClick={() => {
                          setFiles((old) => old.filter((_, i) => i !== index));
                          setResults([]);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                {preview && (
                  <img
                    className="preview"
                    src={preview}
                    alt="Selected image preview"
                  />
                )}
                {files[0] &&
                  !imageInput &&
                  !server &&
                  tool.id !== "organize" && (
                    <>
                      <PdfPreview file={files[0]} />
                      <p className="status">
                        {pageCount
                          ? `${pageCount} pages in first PDF`
                          : "PDF preview"}
                      </p>
                    </>
                  )}
              </>
            )}
            <fieldset disabled={busy} className="settings">
              <legend>Settings</legend>
              <div className="fields">
                {[
                  "split",
                  "pdf-to-jpg",
                  "rotate",
                  "edit",
                  "sign",
                  "watermark",
                ].includes(tool.id) && (
                  <Field label="Page ranges">
                    <input
                      value={options.pages}
                      placeholder="all or 1-3, 5"
                      onChange={(e) => set("pages", e.target.value)}
                    />
                  </Field>
                )}
                {tool.id === "rotate" && (
                  <Field label="Rotation">
                    <select
                      value={options.rotation}
                      onChange={(e) => set("rotation", Number(e.target.value))}
                    >
                      {[90, 180, 270].map((n) => (
                        <option key={n} value={n}>
                          {n} degrees
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {(isImage || tool.id === "pdf-to-jpg") && (
                  <Field label="Output format">
                    <select
                      value={options.format}
                      onChange={(e) => set("format", e.target.value)}
                    >
                      <option value="image/jpeg">JPEG</option>
                      <option value="image/png">PNG</option>
                      {isImage && <option value="image/webp">WebP</option>}
                    </select>
                  </Field>
                )}
                {(isImage ||
                  ["pdf-to-jpg", "compress-pdf"].includes(tool.id)) && (
                  <Field
                    label={`Quality ${Number(options.quality).toFixed(2)}`}
                  >
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.01"
                      value={options.quality}
                      onChange={(e) => set("quality", Number(e.target.value))}
                    />
                  </Field>
                )}
                {["pdf-to-jpg", "compress-pdf"].includes(tool.id) && (
                  <Field label="Render scale">
                    <select
                      value={options.scale}
                      onChange={(e) => set("scale", Number(e.target.value))}
                    >
                      <option value=".75">Low (0.75x)</option>
                      <option value="1">Standard (1x)</option>
                      <option value="1.4">High (1.4x)</option>
                      <option value="2">Very high (2x)</option>
                    </select>
                  </Field>
                )}
                {tool.id === "resize" && (
                  <>
                    <Field label="Width (px)">
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        value={options.width}
                        onChange={(e) =>
                          updateDimension("width", e.target.value)
                        }
                      />
                    </Field>
                    <Field label="Height (px)">
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        value={options.height}
                        onChange={(e) =>
                          updateDimension("height", e.target.value)
                        }
                      />
                    </Field>
                    <Field label="Resize percentage">
                      <input
                        type="number"
                        min="1"
                        max="400"
                        value={options.percent}
                        onChange={(e) => set("percent", Number(e.target.value))}
                      />
                    </Field>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={options.usePercent}
                        onChange={(e) => set("usePercent", e.target.checked)}
                      />
                      Use percentage
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={options.lock}
                        onChange={(e) => set("lock", e.target.checked)}
                      />
                      Lock aspect ratio
                    </label>
                  </>
                )}
                {tool.id === "jpg-to-pdf" && (
                  <>
                    <Field label="Page size">
                      <select
                        value={options.pageSize}
                        onChange={(e) => set("pageSize", e.target.value)}
                      >
                        <option value="a4">A4</option>
                        <option value="letter">Letter</option>
                        <option value="original">Image dimensions</option>
                      </select>
                    </Field>
                    <Field label="Orientation">
                      <select
                        value={options.orientation}
                        onChange={(e) => set("orientation", e.target.value)}
                      >
                        <option>portrait</option>
                        <option>landscape</option>
                      </select>
                    </Field>
                    <Field label="Margin (points)">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={options.margin}
                        onChange={(e) => set("margin", e.target.value)}
                      />
                    </Field>
                    <Field label="Image fit">
                      <select
                        value={options.fit}
                        onChange={(e) => set("fit", e.target.value)}
                      >
                        <option value="contain">Fit inside page</option>
                        <option value="cover">Fill (may crop)</option>
                      </select>
                    </Field>
                  </>
                )}
                {marking && (
                  <>
                    <Field
                      label={tool.id === "sign" ? "Typed signature" : "Text"}
                    >
                      <input
                        value={options.text}
                        onChange={(e) => set("text", e.target.value)}
                      />
                    </Field>
                    <Field label="Font size / image size">
                      <input
                        type="number"
                        min="8"
                        max="96"
                        value={options.size}
                        onChange={(e) => set("size", e.target.value)}
                      />
                    </Field>
                    <Field label="X (points from left)">
                      <input
                        type="number"
                        min="0"
                        value={options.x}
                        onChange={(e) => set("x", e.target.value)}
                      />
                    </Field>
                    <Field label="Y (points from bottom)">
                      <input
                        type="number"
                        min="0"
                        value={options.y}
                        onChange={(e) => set("y", e.target.value)}
                      />
                    </Field>
                    <Field label={`Opacity ${options.opacity}`}>
                      <input
                        type="range"
                        min=".1"
                        max="1"
                        step=".05"
                        value={options.opacity}
                        onChange={(e) => set("opacity", Number(e.target.value))}
                      />
                    </Field>
                    <Field label="Text angle">
                      <input
                        type="number"
                        min="-180"
                        max="180"
                        value={options.angle}
                        onChange={(e) => set("angle", e.target.value)}
                      />
                    </Field>
                    {tool.id === "edit" && (
                      <Field label="Annotation">
                        <select
                          value={options.shape}
                          onChange={(e) => set("shape", e.target.value)}
                        >
                          <option value="text">Text or uploaded image</option>
                          <option value="rectangle">Rectangle</option>
                        </select>
                      </Field>
                    )}
                    <Field label="Optional PNG mark">
                      <input
                        type="file"
                        accept="image/png"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (
                            file &&
                            (file.type !== "image/png" ||
                              file.size > 5 * 1024 * 1024)
                          )
                            return setErrors([
                              "Mark image must be PNG under 5 MB.",
                            ]);
                          setMarkImage(file || null);
                        }}
                      />
                    </Field>
                    {markImage && (
                      <button
                        className="button quiet"
                        onClick={() => setMarkImage(null)}
                      >
                        Use text instead
                      </button>
                    )}
                  </>
                )}
              </div>
              {marking && (
                <div className="fields">
                  <Field label="Font style">
                    <select
                      value={options.font}
                      onChange={(e) => set("font", e.target.value)}
                    >
                      <option value="regular">Regular</option>
                      <option value="bold">Bold</option>
                      <option value="italic">Italic</option>
                    </select>
                  </Field>
                  <Field label="Text or border color">
                    <input
                      type="color"
                      value={options.color}
                      onChange={(e) => set("color", e.target.value)}
                    />
                  </Field>
                </div>
              )}
              {["sign", "edit"].includes(tool.id) && (
                <Signature
                  annotation={tool.id === "edit"}
                  onChange={setMarkImage}
                />
              )}
            </fieldset>
            {tool.id === "organize" && (
              <>
                <div className="workspace-actions">
                  <button
                    className="button quiet"
                    disabled={busy}
                    onClick={() =>
                      setPages(
                        Array.from({ length: pageCount }, (_, index) => ({
                          index,
                          rotation: 0,
                          selected: false,
                        })),
                      )
                    }
                  >
                    Reset page changes
                  </button>
                  <button
                    className="button quiet"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Delete the selected pages from the output?",
                        )
                      )
                        setPages((old) => old.filter((page) => !page.selected));
                    }}
                  >
                    Delete selected pages
                  </button>
                </div>
                <div className="pages-grid">
                  {pages.map((page, index) => (
                    <div className="page-tile" key={page.index}>
                      <PdfPreview
                        file={files[0]}
                        index={page.index}
                        rotation={page.rotation}
                      />
                      <label>
                        <input
                          type="checkbox"
                          checked={page.selected}
                          disabled={busy}
                          onChange={(e) =>
                            setPages((old) =>
                              old.map((p, i) =>
                                i === index
                                  ? { ...p, selected: e.target.checked }
                                  : p,
                              ),
                            )
                          }
                        />
                        Page {page.index + 1}
                      </label>
                      <div>
                        <button
                          disabled={busy || index === 0}
                          aria-label={`Move page ${index + 1} up`}
                          onClick={() => movePage(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          disabled={busy || index === pages.length - 1}
                          aria-label={`Move page ${index + 1} down`}
                          onClick={() => movePage(index, 1)}
                        >
                          ↓
                        </button>
                        <button
                          disabled={busy}
                          aria-label={`Rotate page ${page.index + 1}`}
                          onClick={() =>
                            setPages((old) =>
                              old.map((p, i) =>
                                i === index
                                  ? { ...p, rotation: (p.rotation + 90) % 360 }
                                  : p,
                              ),
                            )
                          }
                        >
                          Rotate
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {server && (
              <div className="server-consent">
                <p>
                  {capabilities === null
                    ? "Checking conversion engine..."
                    : capabilities[tool.id]
                      ? "Conversion engine available."
                      : "Conversion engine is not available. Start Docker Compose, or install LibreOffice/qpdf and configure its path."}
                </p>
                {capError && <p role="alert">{capError}</p>}
                <button className="button quiet" onClick={checkCapabilities}>
                  Refresh capability
                </button>
                {["protect", "unlock"].includes(tool.id) && (
                  <label className="full-field">
                    {tool.id === "protect"
                      ? "New PDF password"
                      : "Current PDF password"}
                    <input
                      type="password"
                      value={password}
                      maxLength="128"
                      autoComplete="off"
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                )}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  I approve uploading these selected files
                  {password ? " and the entered password" : ""} for temporary
                  server processing.
                </label>
              </div>
            )}
            <div className="workspace-actions">
              <button
                className="button primary"
                disabled={
                  busy || (server && (!consent || !capabilities?.[tool.id]))
                }
                onClick={run}
              >
                {busy
                  ? "Processing..."
                  : server
                    ? "Upload and process"
                    : "Process locally"}
              </button>
              {busy && (
                <button
                  className="button quiet"
                  onClick={() => {
                    controller.current.abort();
                    setStatus(
                      "Cancelling after the current local operation finishes...",
                    );
                  }}
                >
                  Cancel
                </button>
              )}
              {files.length > 0 && (
                <button
                  className="button quiet"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm("Clear all selected files and results?")
                    ) {
                      setFiles([]);
                      setResults([]);
                      setPages([]);
                      setErrors([]);
                      setPageCount(0);
                      setConsent(false);
                    }
                  }}
                >
                  Clear selection
                </button>
              )}
            </div>
            <p className="status" role="status" aria-live="polite">
              {status}
            </p>
            <div role="alert">
              {errors.map((error, index) => (
                <p className="error" key={index}>
                  {error}
                </p>
              ))}
            </div>
            <div className="results">
              {results.map((result, index) => (
                <div className="result" key={index}>
                  <span>
                    {result.name}
                    <small>
                      {formatBytes(result.blob.size)}
                      {result.original
                        ? ` (original ${formatBytes(result.original)}; ${result.blob.size < result.original ? `${((1 - result.blob.size / result.original) * 100).toFixed(1)}% smaller` : "no reduction"})`
                        : ""}
                    </small>
                  </span>
                  <button
                    className="button lime-button"
                    onClick={() => handleDownload(() => download(result.blob, result.name))}
                  >
                    Download
                  </button>
                </div>
              ))}
              {results.length > 1 && (
                <button
                  className="button quiet"
                  onClick={() =>
                    handleDownload(async () => {
                      try {
                        download(
                          await zipResults(results),
                          "ghost-files-results.zip",
                        );
                      } catch (error) {
                        setErrors([error.message]);
                      }
                    })
                  }
                >
                  Download all as ZIP
                </button>
              )}
            </div>
          </div>
          <aside className="side-panel">
            <h3>Before you process</h3>
            <p>
              Local operations need no backend. Server operations require
              approval for every selection.
            </p>
            {tool.id.startsWith("pdf-to-") &&
              ["pdf-to-word", "pdf-to-excel", "pdf-to-powerpoint"].includes(
                tool.id,
              ) && (
                <p>
                  Exports rebuild selectable text into editable content.
                  Original layout, graphics, and exact table structure may
                  differ. Scanned PDFs need OCR; this tool reports them as
                  unsupported.
                </p>
              )}
            {tool.id === "compress-pdf" && (
              <p>
                Compression rasterizes pages. Searchable text, interactive
                forms, links, and digital signatures will be lost; quality can
                decrease. Some files will grow. Actual sizes are shown.
              </p>
            )}
            {tool.id === "sign" && (
              <p>
                This adds a visible signature mark. It is not a
                certificate-based digital signature or a request for someone
                else to sign.
              </p>
            )}
            {isImage && (
              <p>
                Re-encoding may reduce quality. JPEG removes transparency and
                uses a white background. PNG ignores the quality slider.
              </p>
            )}
            <p>
              Limits: 300 pages, 24 megapixels per image, and 150 MB per
              session. For memory-heavy work use smaller batches.
            </p>
          </aside>
        </div>
      </section>
    </div>
  );
}
