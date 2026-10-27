# Ghost Files

A JavaScript MERN application: React/Vite frontend, Express/Node API, and optional MongoDB/Mongoose metadata support. There is no TypeScript build step. Documents are never stored in MongoDB.

## Run all conversion tools

Install Docker Desktop, start it, and run:

```powershell
docker compose up --build -d --wait
```

Open **http://localhost:4180**. This builds the frontend and installs LibreOffice Writer/Calc/Impress and qpdf in the API container. The API is reached through `/api` on the same origin; it is not published separately. Port 4180 avoids an older static preview that may occupy 4173.

Stop services with `docker compose stop`. No document volume is created. The optional MongoDB volume is only used if you enable its profile.

## Development

Requires Node.js 22.15+ and npm. On PowerShell installations that block `npm.ps1`, use `npm.cmd`.

```powershell
Copy-Item .env.example .env
npm.cmd ci
npm.cmd run dev
```

Frontend: http://localhost:5173. API: http://localhost:8787/health. Vite proxies `/api` requests to the API. Local tools work even if the API is stopped. Native development server conversion requires LibreOffice and qpdf installed on PATH; alternatively set `LIBREOFFICE_PATH` and `QPDF_PATH` in `.env` to their executable paths. Capabilities are determined by actual executable probes, not an enable flag alone.

## Tools and limits

| Tool              | Implementation / relevant limit                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Merge PDF         | Copies PDF pages in displayed file order; accessible file move buttons                                  |
| Split PDF         | Parses `1-3, 5`, or `all`; separate page outputs and ZIP download                                       |
| Compress PDF      | Renders pages to JPEG and rebuilds the PDF; selectable quality and resolution, actual size comparison   |
| PDF to Word       | Selectable PDF text to editable DOCX paragraphs                                                         |
| PDF to PowerPoint | Selectable PDF text to editable slide text boxes                                                        |
| PDF to Excel      | Positioned PDF text rows/cells to XLSX sheets                                                           |
| Word to PDF       | Real LibreOffice conversion of validated DOCX files                                                     |
| PowerPoint to PDF | Real LibreOffice conversion of validated PPTX files                                                     |
| Excel to PDF      | Real LibreOffice conversion of validated XLSX files                                                     |
| Edit PDF          | Add text, PNG images, or rectangular annotations with page ranges and coordinates                       |
| PDF to JPG        | PDF.js raster rendering; JPEG/PNG, page ranges, resolution, individual and ZIP downloads                |
| JPG to PDF        | JPEG/PNG/WebP; file order, page size, margins, fit, orientation                                         |
| Sign PDF          | Draw a signature or add typed/PNG visible marks; not certificate signing or remote signature collection |
| Watermark         | Text/PNG marks with opacity, font size, text angle, page range, and coordinates                         |
| Rotate PDF        | Adds rotation to existing rotation on selected pages                                                    |
| HTML to PDF       | Sanitized pasted HTML to page images in a real downloadable PDF                                         |
| Unlock PDF        | qpdf decrypts using a known password; no password cracking                                              |
| Protect PDF       | qpdf AES-256 encryption with a user-entered password                                                    |
| Organize PDF      | Lazy page previews, reorder, rotate, select/delete, reset, export                                       |
| Image converter   | Batch PNG/JPEG/WebP conversion                                                                          |
| Image resizer     | Dimensions/percentage/aspect lock and output format                                                     |
| Image compressor  | Re-encoding with quality settings and actual before/after byte sizes                                    |

Local PDFs are limited to 300 pages, local files to 50 MB each, server uploads to 25 MB, decoded image/render canvases to 24 megapixels, and sessions to 20 files / 150 MB input. Page-image exports are capped at 100 MB per PDF and batch results at 150 MB. Process smaller batches on memory-constrained devices.

PDF-to-Office exports rebuild selectable text. They do not reproduce original layouts or graphics, perform OCR, or guarantee table reconstruction. Scanned/image-only PDFs report an error. HTML allows headings, paragraphs, lists, tables, and simple text structure. It strips scripts, styles, images, and external resources; arbitrary webpage URLs are unsupported. HTML output is rasterized.

PDF compression rasterizes pages, losing searchability, form fields, links, accessibility structure, and digital signatures. Quality can decrease and outputs can grow; actual sizes are displayed. JPEG uses white behind transparent pixels. PNG ignores lossy quality settings. Built-in PDF annotation fonts support Latin text; use a PNG mark for other scripts.

## Privacy and security

- Local tools run in browser memory using bundled dependencies. No document analytics, third-party CDN processing, persistent document storage, or automatic upload.
- Every server conversion requires a visible informed-consent checkbox. The API checks consent before parsing multipart data. A client header is a request contract, not authentication.
- Uploads are validated by extension, MIME type, file signature, and Office ZIP structure. Office archives with macros, embedded executable objects, external resource links, too many entries, or excessive expanded size are rejected.
- Each native conversion uses a random restricted temporary directory and fixed internal filenames. Commands are invoked without a shell. Passwords are passed in a restricted argument file and omitted from process command lines and application logs.
- Passwords have a 1–128 character limit; line breaks, NUL, and leading `@` are rejected to prevent argument-file expansion.
- Workspaces are removed in `finally` after success/failure/cancellation. Abandoned jobs expire after 15 minutes and are swept every minute and at startup. Temporary files are not served publicly or stored in database/document volumes. Ordinary deletion is not a guarantee of physical block erasure.
- The API handles one conversion at a time, enforces a timeout, and rate-limits conversion requests to 10/minute. In Linux, timeout/cancellation kills the process group. Direct Windows subprocess execution cannot offer equivalent process-tree isolation; use Docker for native conversion of untrusted documents.
- Docker runs the API as a non-root user, read-only root filesystem, bounded temporary filesystem, dropped capabilities, process/memory/CPU limits, and an internal network without internet egress. The converter shares the API container; it is not a per-job VM. Deployment hardening is not an independent security audit.
- Nginx supplies CSP, nosniff, and referrer policy headers. Express uses Helmet, strict configured CORS, upload limits, and sanitized errors. Add an HTTPS reverse proxy before exposing the deployment publicly. Local HTTP examples are for local development.

Local processing reduces server exposure but cannot eliminate compromised-device, browser, malicious-input, or dependency risks.

## Configuration

See `.env.example`. `LIBREOFFICE_ENABLED`, `LIBREOFFICE_PATH`, `QPDF_PATH`, `MAX_UPLOAD_BYTES`, `JOB_TIMEOUT_MS`, and `JOB_TTL_MS` configure conversion behavior. MongoDB is optional and disabled by default; `MONGODB_ENABLED=true` connects Mongoose to `MONGODB_URI`. The Job model is available for metadata only; conversion does not require or retain job records. No file contents should be added to that model.

## Verification

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run test:e2e
docker compose up --build -d --wait
npm.cmd run test:native
npm.cmd audit
```

The Node tests validate PDF page order/count/rotation, split ranges, signatures, ZIP filename collisions, dimension limits, server validation, temporary-job cleanup, timeouts, health/capability routes, and consent rejection. Tests use generated non-sensitive data.

Playwright tests use installed headless Chrome and exercise real uploads into browser file inputs and downloaded PDF/JPEG/ZIP/DOCX/PPTX/XLSX outputs, batch failures, HTML rendering, mobile layout, consent blocking, and absence of upload requests during a local merge. `playwright.config.js` can use another installed channel when Chrome is unavailable. This verifies the covered journeys, not a complete application audit.

Native integration tests require the running Docker deployment on port 4180 and exercise actual LibreOffice conversion and qpdf encryption/decryption. `TEST_BASE_URL` can select another API origin. Native failure/cleanup checks can also be inspected using `docker compose exec api ls -la /tmp/ghost-files-jobs` after a job.

To run the browser suite against the complete Docker deployment, including a real consent-approved password upload, set `$env:BROWSER_BASE_URL='http://127.0.0.1:4180'` before `npm.cmd run test:e2e`. Run native and browser suites sequentially because they share the single conversion worker.

Verified on this workspace: 18 Node tests, 12 production browser tests, and 2 native integration tests passed; the production build and Docker deployment succeeded; npm audit reported zero vulnerabilities. Temporary job directories were empty after the successful and failed password conversions. These results cover the generated fixtures and documented limits, not every possible document.

## Troubleshooting

- Engine unavailable: start Docker, or install LibreOffice/qpdf and set correct executable paths. Refresh capabilities in the tool.
- HTTP 429: wait a minute or retry after the running conversion completes.
- Invalid Office upload: only DOCX/XLSX/PPTX OOXML files are accepted. Legacy DOC/XLS/PPT, encrypted Office documents, macros, and external links are not supported.
- Large PDF/image: lower rendering scale, split the document, or use smaller batches. Memory limits are intentionally finite.
- Encrypted PDF: use Unlock PDF and its known password before local manipulation.
- Interrupted conversion: completed batch outputs stay downloadable. A server job is killed/cleaned on disconnect or timeout.
- Old static UI on port 4173: use the React dev URL (5173) or complete Docker app (4180). The `dist/` folder is a historical prototype; it is not the maintained application.

## Source

`client/src/components/` contains the UI; `client/src/lib/` contains local processors and validation. `server/src/conversion.js` contains native execution/validation/cleanup. `server/src/routes/` contains capability and conversion endpoints. All maintained source files are JavaScript or JSX.
