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
import { createAuthRouter, User, AuthSession } from "./auth.js";
import { resolveMongoUri } from "./database.js";
import { isAllowedOrigin } from "./origin.js";
const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(config, origin)),
    methods: ["GET", "POST"],
    allowedHeaders: [
      "Content-Type",
      "x-ghost-auth",
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
const authRouter = createAuthRouter(config);
app.use("/auth", authRouter);
app.use("/convert", authRouter.requireSession, officeRouter);
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
  if (config.MONGODB_ENABLED === "true") {
    const uri = await resolveMongoUri(
      config.MONGODB_URI,
      config.MONGODB_DNS_SERVERS,
    );
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    if (config.AUTH_ENABLED === "true")
      await Promise.all([User.init(), AuthSession.init()]);
  }
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
