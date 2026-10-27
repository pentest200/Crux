# Ghost Files

A privacy-first file toolkit built with React, Vite, Express, Node.js, and MongoDB. Convert and edit files locally where possible; explicitly approve temporary uploads when a native conversion engine is needed. Documents are never stored in MongoDB.

[Live application](https://ghost-files-client-0fz5.onrender.com) · [Security notes](docs/security-review.md) · [Tool catalogue](client/src/lib/catalog.js)

## At a glance

- 24 tools, each with a shareable `/tools/...` route.
- Search by tool name or description, with case/whitespace normalization, a result count, a clear button, and Escape-to-clear.
- Local processing can run without an account; downloading results requires login. Server conversions require both authentication and upload consent.
- Real signup/login backed by MongoDB, bcrypt password hashes, and revocable JWT sessions in HttpOnly cookies.
- Batch processing, individual downloads, ZIP exports, mobile layouts, and reduced-motion support.

## Contents

- [Development](#development)
- [Accounts and MongoDB](#accounts-and-mongodb)
- [Docker engine preview](#docker-engine-preview)
- [Tools and limits](#tools-and-limits)
- [Privacy and security](#privacy-and-security)
- [Configuration](#configuration)
- [Render deployment](#render-deployment)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Source](#source)

## Docker engine preview

Install Docker Desktop, start it, and run:

```powershell
docker compose up --build -d --wait
```

Open **http://localhost:4180**. This builds the frontend and installs LibreOffice Writer/Calc/Impress and qpdf in the API container. The API is reached through `/api` on the same origin; it is not published separately.

**The checked-in Compose configuration is an engine/UI preview, not a fully configured account deployment.** It disables MongoDB and authentication, so downloading results and authenticated server conversions remain unavailable. Enabling the MongoDB profile alone does not configure accounts. Use the development account setup below or the production Render configuration for the complete flow. The isolated API network also has no internet egress; an external Atlas connection requires a deliberate networking change.

Stop services with `docker compose stop`. No document volume is created. The optional MongoDB volume is only used if you enable its profile.

## Development

Requires Node.js 22.15+ and npm. On PowerShell installations that block `npm.ps1`, use `npm.cmd`.

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd ci
npm.cmd run dev
```

Frontend: http://localhost:5173 (Vite may choose 5174 if 5173 is occupied). API: http://localhost:8787/health. Vite proxies `/api` requests to the API. Development accepts `localhost` and `127.0.0.1` on ports 5173/5174; other frontend origins must match `CLIENT_ORIGIN`. Production accepts only its configured client origin.

Local processing works even if the API is stopped, but account operations and downloads need the API. Native development conversion also needs LibreOffice and qpdf on PATH; alternatively set `LIBREOFFICE_PATH` and `QPDF_PATH` in `.env`. Capabilities are determined by executable probes, not an enable flag alone. Restart the API after changing `.env`.

## Accounts and MongoDB

1. Create a MongoDB database user and allow the API's network access in Atlas, or use your own MongoDB instance.
2. Edit the **root** `.env` file; do not put database credentials or signing secrets in `client/` or any `VITE_*` variable.
3. Configure the following placeholders with your own values, then restart the API:

```dotenv
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173
MONGODB_ENABLED=true
MONGODB_URI=mongodb+srv://USERNAME:URL_ENCODED_PASSWORD@YOUR_CLUSTER.mongodb.net/ghost-files
AUTH_ENABLED=true
AUTH_JWT_SECRET=REPLACE_WITH_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
```

Generate a signing secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`. Keep the result private. Use a strong, unique database password; URI encoding is **not encryption**. Encode reserved characters in the username/password portions only (`@` becomes `%40`, for example), not the whole connection string. Do not commit `.env`; it is ignored by Git and Docker build context.

Optional `MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8` supports networks with broken Atlas SRV DNS. Leave it empty if normal DNS works. Atlas authentication or network-access failures are separate from DNS failures.

Visit `/register` (or `/signup`) to create an account and `/login` to sign in. The API must report `{"enabled":true}` at `/api/auth/status` through the frontend. `users` stores name, normalized email, timestamps, and a bcrypt cost-12 password hash—not plaintext passwords. `authsessions` stores a hashed session identifier, user reference, and expiry, allowing logout/revocation. MongoDB is optional for local processing, **required for accounts**.

Account passwords must be at least 15 characters and no more than 72 UTF-8 bytes. Sessions expire after eight hours. Production cookies use `__Host-ghost_session`, Secure, HttpOnly, SameSite=Strict, and Path=/; local HTTP uses `ghost_session` without Secure. Tokens are not stored in localStorage. Production authentication requires HTTPS. Email verification, password reset, and MFA are not implemented.

## Tools and limits

All 24 tools have independent pages under `/tools/`, for example
`/tools/image-converter`, `/tools/background-remover`, `/tools/merge-pdf`,
`/tools/word-to-pdf`, and `/tools/video-to-audio`. Tool cards link to these pages;
direct visits, refresh, and browser Back/Forward work. The complete route list
is defined in `client/src/lib/catalog.js`. Nginx's existing SPA fallback serves
direct tool URLs. Files remain in memory and must be selected again after refresh.

| Tool               | Implementation / relevant limit                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Merge PDF          | Copies PDF pages in displayed file order; accessible file move buttons                                       |
| Split PDF          | Parses `1-3, 5`, or `all`; separate page outputs and ZIP download                                            |
| Compress PDF       | Renders pages to JPEG and rebuilds the PDF; selectable quality and resolution, actual size comparison        |
| PDF to Word        | Selectable PDF text to editable DOCX paragraphs                                                              |
| PDF to PowerPoint  | Selectable PDF text to editable slide text boxes                                                             |
| PDF to Excel       | Positioned PDF text rows/cells to XLSX sheets                                                                |
| Word to PDF        | Real LibreOffice conversion of validated DOCX files                                                          |
| PowerPoint to PDF  | Real LibreOffice conversion of validated PPTX files                                                          |
| Excel to PDF       | Real LibreOffice conversion of validated XLSX files                                                          |
| Edit PDF           | Add text, PNG images, or rectangular annotations with page ranges and coordinates                            |
| PDF to JPG         | PDF.js raster rendering; JPEG/PNG, page ranges, resolution, individual and ZIP downloads                     |
| JPG to PDF         | JPEG/PNG/WebP; file order, page size, margins, fit, orientation                                              |
| Sign PDF           | Draw a signature or add typed/PNG visible marks; not certificate signing or remote signature collection      |
| Watermark          | Text/PNG marks with opacity, font size, text angle, page range, and coordinates                              |
| Rotate PDF         | Adds rotation to existing rotation on selected pages                                                         |
| HTML to PDF        | Sanitized pasted HTML to page images in a real downloadable PDF                                              |
| Unlock PDF         | qpdf decrypts using a known password; no password cracking                                                   |
| Protect PDF        | qpdf AES-256 encryption with a user-entered password                                                         |
| Organize PDF       | Lazy page previews, reorder, rotate, select/delete, reset, export                                            |
| Image converter    | Batch PNG/JPEG/WebP conversion                                                                               |
| Image resizer      | Dimensions/percentage/aspect lock and output format                                                          |
| Image compressor   | Re-encoding with quality settings and actual before/after byte sizes                                         |
| Background remover | In-browser IMG.LY model; transparent PNG or compositing onto a color/image; first run downloads model assets |
| Video to audio     | Browser-based audio extraction; supported codecs/containers depend on the browser                            |

Local PDFs are limited to 300 pages, local files to 50 MB each, server uploads to 25 MB, decoded image/render canvases to 24 megapixels, and sessions to 20 files / 150 MB input. Page-image exports are capped at 100 MB per PDF and batch results at 150 MB. Process smaller batches on memory-constrained devices.

PDF-to-Office exports rebuild selectable text. They do not reproduce original layouts or graphics, perform OCR, or guarantee table reconstruction. Scanned/image-only PDFs report an error. HTML allows headings, paragraphs, lists, tables, and simple text structure. It strips scripts, styles, images, and external resources; arbitrary webpage URLs are unsupported. HTML output is rasterized.

PDF compression rasterizes pages, losing searchability, form fields, links, accessibility structure, and digital signatures. Quality can decrease and outputs can grow; actual sizes are displayed. JPEG uses white behind transparent pixels. PNG ignores lossy quality settings. Built-in PDF annotation fonts support Latin text; use a PNG mark for other scripts.

## Privacy and security

PPTX conversions prepare a temporary copy before launching LibreOffice. Embedded PNG/JPEG/WebP images larger than 4096 pixels on either edge are downsampled proportionally; small images and slide XML are unchanged. This reduces memory spikes from highly compressed, very large images, but can reduce fine image detail in the PDF. The original upload is never overwritten. Image preparation runs in a separate process, with a 100-megapixel input limit, no image cache, and the same overall conversion deadline. It exits before LibreOffice starts. Malformed or animated raster images are rejected; other media formats are not optimized. These bounds reduce memory risk, not a guarantee for every presentation.

- Local tools process file contents in browser memory, without document analytics or automatic upload. Background removal fetches model assets from `staticimgly.com`, but does not send your image there. The interface also loads Google Fonts; local processing does not mean zero network requests or full offline support.
- Downloads are checked through `/api/auth/download`; server `/convert` routes validate the session before accepting an upload. Client-side download gating is a product workflow, not DRM: users control data already processed in their own browser.
- Every server conversion requires a visible informed-consent checkbox. The API checks consent before parsing multipart data. A client header is a request contract, not authentication.
- Uploads are validated by extension, MIME type, file signature, and Office ZIP structure. Office archives with macros, embedded executable objects, external resource links, too many entries, or excessive expanded size are rejected.
- Each native conversion uses a random restricted temporary directory and fixed internal filenames. Commands are invoked without a shell. Passwords are passed in a restricted argument file and omitted from process command lines and application logs.
- PDF encryption/unlock passwords have a 1–128 character limit; line breaks, NUL, and leading `@` are rejected to prevent argument-file expansion. This is separate from the account-password policy above.
- Workspaces are removed in `finally` after success/failure/cancellation. Abandoned jobs expire after 15 minutes and are swept every minute and at startup. Temporary files are not served publicly or stored in database/document volumes. Ordinary deletion is not a guarantee of physical block erasure.
- The API handles one conversion at a time, enforces a timeout, and rate-limits conversion requests to 10/minute. In Linux, timeout/cancellation kills the process group. Direct Windows subprocess execution cannot offer equivalent process-tree isolation; use Docker for native conversion of untrusted documents.
- Docker runs the API as a non-root user, read-only root filesystem, bounded temporary filesystem, dropped capabilities, process/memory/CPU limits, and an internal network without internet egress. The converter shares the API container; it is not a per-job VM. Deployment hardening is not an independent security audit.
- Nginx supplies CSP, nosniff, and referrer policy headers. Express uses Helmet, strict configured CORS, upload limits, and sanitized errors. Add an HTTPS reverse proxy before exposing the deployment publicly. Local HTTP examples are for local development.

Local processing reduces server exposure but cannot eliminate compromised-device, browser, malicious-input, or dependency risks.

## Configuration

See [.env.example](.env.example) for development defaults.

| Setting                                                | Purpose                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `CLIENT_ORIGIN`                                        | Trusted frontend origin; exact HTTPS origin in production              |
| `AUTH_ENABLED`, `MONGODB_ENABLED`                      | Both must be `true` to use accounts                                    |
| `MONGODB_URI`, `AUTH_JWT_SECRET`                       | Server-only database connection and session-signing secret             |
| `MONGODB_DNS_SERVERS`                                  | Optional explicit DNS resolvers for Atlas discovery                    |
| `LIBREOFFICE_ENABLED`, `LIBREOFFICE_PATH`, `QPDF_PATH` | Native engine configuration                                            |
| `MAX_UPLOAD_BYTES`, `JOB_TIMEOUT_MS`, `JOB_TTL_MS`     | Upload, execution, and temporary-job limits                            |
| `VITE_API_PROXY_TARGET`                                | Optional development proxy target; defaults to `http://127.0.0.1:8787` |

The Job model is available for metadata only; conversion does not retain job records. No file contents should be added to that model.

## Render deployment

[render.yaml](render.yaml) defines Docker web services for the client and API. Both deploy from the repository, with SPA fallback routing on the client and `/health` on the API.

1. Connect the GitHub repository to the intended Render Blueprint/workspace.
2. Set server-only `MONGODB_URI`, enable MongoDB/authentication, and retain a strong `AUTH_JWT_SECRET` (the Blueprint can generate it).
3. Set API `CLIENT_ORIGIN` to the exact public HTTPS frontend origin. Set the client's `API_BASE_URL` to the public API origin; the browser uses same-origin `/api` through Nginx.
4. Allow the API's network access in Atlas. Keep production secrets in Render, not the repository or frontend build.
5. Push tested changes to the configured branch. With commit auto-deploy enabled, the push starts deployment; do not trigger a duplicate deploy.
6. Wait for **both** services to become live, then verify signup, login/logout, guest download blocking, authenticated download, and `/api/auth/status`.

Free services may need time to wake up. A successful health response does not alone verify the account or conversion flow. Chrome's deceptive-site warning, if present, requires investigation and Google Search Console review; changing app code does not automatically remove Google's classification.

## Verification

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run test:e2e
npm.cmd audit
```

The Node tests validate PDF page order/count/rotation, split ranges, signatures, ZIP filename collisions, dimension limits, server validation, temporary-job cleanup, timeouts, health/capability routes, and consent rejection. Tests use generated non-sensitive data.

Playwright tests use installed headless Chrome and exercise real uploads into browser file inputs and downloaded PDF/JPEG/ZIP/DOCX/PPTX/XLSX outputs, batch failures, HTML rendering, mobile layout, consent blocking, and absence of upload requests during a local merge. `playwright.config.js` can use another installed channel when Chrome is unavailable. This verifies the covered journeys, not a complete application audit.

The default browser suite starts an isolated Vite frontend on **127.0.0.1:5174** with a test API target on port 8794. Leave 5174 free when running it. Search regression tests check computed opacity as well as result counts, including repeated clearing, no matches, browser Back, mobile, and reduced-motion behavior.

MongoDB authentication tests are skipped unless `TEST_AUTH_MONGODB_URI` is supplied. Use a disposable local database, never production, to run the complete account suite:

```powershell
docker run -d --rm --name ghostfiles-auth-tests -p 127.0.0.1:27028:27017 --tmpfs /data/db mongo:8.0.32 --bind_ip_all
$env:TEST_AUTH_MONGODB_URI='mongodb://127.0.0.1:27028'
try {
  npm.cmd test
  npm.cmd run test:e2e
} finally {
  Remove-Item Env:TEST_AUTH_MONGODB_URI
  docker stop ghostfiles-auth-tests
}
```

Tests create and drop only randomly named `ghost_auth_test_*` databases. The real account browser test covers signup through the download prompt and `/register`, login via `/login`, hashing, cookie security, reload, logout, revocation, and resumed downloads.

For native PPTX/LibreOffice and qpdf upload checks, use an auth-enabled deployment with those engines installed and an existing **test** account. Supply `BROWSER_BASE_URL`, `TEST_AUTH_EMAIL`, and `TEST_AUTH_PASSWORD`, then run `npm.cmd run test:e2e -- tests/server-flow.spec.js`. These tests require explicit upload consent and check real presentation-to-PDF and protected PDF downloads. Do not use personal credentials or run competing conversions against the single conversion worker. The older `tests/native.test.js` harness does not attach account sessions and is not the authenticated release check.

See [docs/security-review.md](docs/security-review.md) for the known transitive dependency advisory. Tests cover generated fixtures and documented limits, not every possible document or a complete security audit.

## Troubleshooting

- Engine unavailable: start Docker, or install LibreOffice/qpdf and set correct executable paths. Refresh capabilities in the tool.
- Search seems stuck: clear the input, use **Clear search**, or press Escape. All 24 cards should return; refresh once if an old production tab still has the pre-fix bundle loaded.
- Login/signup HTTP 403: check `CLIENT_ORIGIN`, the browser's actual origin, and that the API was restarted after configuration changes. Keep production restricted to the real HTTPS frontend, not localhost or a wildcard.
- HTTP 401 from `/auth/me` while signed out is expected. A 401 from login means credentials were rejected, not a successful login.
- Accounts unavailable/HTTP 503: enable both MongoDB and auth, configure the URI/signing secret, and verify Atlas network access. `.env` is not automatically uploaded to Render.
- Conversion HTTP 502/504: the gateway lost the API response or timed out. Wait briefly and explicitly retry; uploads are not automatically replayed. If it repeats, record file size, slide count, failure time, and whether `/api/health` is reachable. Check Render runtime logs/metrics for restarts, memory exhaustion, and timeouts before changing resource limits or blaming the document. A successful small fixture does not prove a large presentation will convert.
- HTTP 429: wait a minute or retry after the running conversion completes.
- Invalid Office upload: only DOCX/XLSX/PPTX OOXML files are accepted. Legacy DOC/XLS/PPT, encrypted Office documents, macros, and external links are not supported.
- Large PDF/image: lower rendering scale, split the document, or use smaller batches. Memory limits are intentionally finite.
- Encrypted PDF: use Unlock PDF and its known password before local manipulation.
- Interrupted conversion: completed batch outputs stay downloadable. A server job is killed/cleaned on disconnect or timeout.
- Old static UI on port 4173: use the React dev URL (5173) or complete Docker app (4180). The `dist/` folder is a historical prototype; it is not the maintained application.

## Source

`client/src/components/` contains the UI; `client/src/lib/` contains local processors and validation. `server/src/conversion.js` contains native execution/validation/cleanup. `server/src/routes/` contains capability and conversion endpoints. All maintained source files are JavaScript or JSX.
