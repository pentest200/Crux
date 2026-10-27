import { Router } from "express";
import { probeCapabilities } from "../conversion.js";
export const capabilitiesRouter = Router();
capabilitiesRouter.get("/", async (_request, response, next) => {
  try {
    response
      .set("Cache-Control", "no-store")
      .json({
        local: [
          "merge",
          "split",
          "compress-pdf",
          "pdf-to-word",
          "pdf-to-powerpoint",
          "pdf-to-excel",
          "edit",
          "pdf-to-jpg",
          "jpg-to-pdf",
          "sign",
          "watermark",
          "rotate",
          "html-to-pdf",
          "organize",
          "convert",
          "resize",
          "compress",
        ],
        server: await probeCapabilities(),
      });
  } catch (error) {
    next(error);
  }
});
