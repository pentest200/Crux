import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import {
  ConversionError,
  convertFile,
  probeCapabilities,
} from "../conversion.js";

export const officeRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 1 },
});
officeRouter.post(
  "/:kind",
  async (request, response, next) => {
    try {
      if (request.header("x-ghost-files-consent") !== "approved")
        throw new ConversionError("Explicit upload consent is required.", 428);
      const capabilities = await probeCapabilities();
      if (!(request.params.kind in capabilities))
        throw new ConversionError("Unknown operation.", 404);
      if (!capabilities[request.params.kind])
        throw new ConversionError(
          "This conversion engine is unavailable. Install LibreOffice/qpdf or start the Docker deployment.",
          503,
        );
      next();
    } catch (error) {
      next(error);
    }
  },
  upload.single("file"),
  async (request, response, next) => {
    const controller = new AbortController();
    const cancel = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.on("close", cancel);
    try {
      const password = request.header("x-document-password")
        ? Buffer.from(request.header("x-document-password"), "base64").toString(
            "utf8",
          )
        : "";
      const output = await convertFile(
        request.file,
        request.params.kind,
        password,
        controller.signal,
      );
      response
        .type("application/pdf")
        .set(
          "Content-Disposition",
          'attachment; filename="ghost-files-result.pdf"',
        )
        .set("Cache-Control", "no-store")
        .send(output);
    } catch (error) {
      next(error);
    } finally {
      response.off("close", cancel);
      if (request.file) request.file.buffer = null;
    }
  },
);
