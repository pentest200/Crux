import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { config } from "./config.js";
import { capabilitiesRouter } from "./routes/capabilities.js";
import { officeRouter } from "./routes/office.js";
import { pathToFileURL } from "node:url";
import { cleanupExpired } from "./conversion.js";
const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: config.CLIENT_ORIGIN,
    methods: ["GET", "POST"],
    allowedHeaders: [
      "Content-Type",
      "x-ghost-files-consent",
      "x-document-password",
    ],
  }),
);
app.use(express.json({ limit: "32kb" }));
app.use(
  "/convert",
  rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.get("/health", (_request, response) =>
  response.json({ ok: true, service: "ghost-files-api" }),
);
app.use("/capabilities", capabilitiesRouter);
app.use("/convert", officeRouter);
app.use((_request, response) =>
  response.status(404).json({ error: "Not found." }),
);
app.use((error, _request, response, _next) => {
  if (error.code === "LIMIT_FILE_SIZE")
    return response.status(413).json({ error: "Uploaded file is too large." });
  if (error.name === "MulterError")
    return response
      .status(400)
      .json({ error: "Send exactly one file and no extra form fields." });
  return response
    .status(error.status || 500)
    .json({ error: error.status ? error.message : "Unexpected server error." });
});
async function start() {
  if (config.MONGODB_ENABLED === "true")
    await mongoose.connect(config.MONGODB_URI);
  await cleanupExpired();
  const timer = setInterval(() => cleanupExpired().catch(() => {}), 60000);
  timer.unref();
  const server = app.listen(config.PORT, () =>
    console.log(`Ghost Files API listening on ${config.PORT}`),
  );
  process.on("SIGTERM", () => {
    clearInterval(timer);
    server.close(() => process.exit(0));
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  start().catch(() => {
    console.error("API startup failed. Check environment configuration.");
    process.exitCode = 1;
  });
export { app };
