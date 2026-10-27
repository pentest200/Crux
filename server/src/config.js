import { z } from "zod";
import { isIP } from "node:net";
const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(8787),
    CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
    MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017/ghost-files"),
    MONGODB_ENABLED: z.enum(["true", "false"]).default("false"),
    MONGODB_DNS_SERVERS: z
      .string()
      .default("")
      .refine(
        (value) =>
          !value || value.split(",").every((server) => isIP(server.trim()) > 0),
        "DNS servers must be comma-separated IP addresses.",
      ),
    AUTH_ENABLED: z.enum(["true", "false"]).default("false"),
    AUTH_JWT_SECRET: z.string().min(32).optional(),
    MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(25 * 1024 * 1024),
    LIBREOFFICE_ENABLED: z.enum(["true", "false"]).default("true"),
    LIBREOFFICE_PATH: z.string().default("libreoffice"),
    QPDF_PATH: z.string().default("qpdf"),
    JOB_TIMEOUT_MS: z.coerce.number().int().min(100).default(60000),
    JOB_TTL_MS: z.coerce.number().int().min(1000).default(900000),
  })
  .superRefine((value, ctx) => {
    if (
      value.AUTH_ENABLED === "true" &&
      (value.MONGODB_ENABLED !== "true" || !value.AUTH_JWT_SECRET)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Authentication requires MongoDB and a signing secret of at least 32 characters.",
        path: ["AUTH_ENABLED"],
      });
    }
    if (
      value.AUTH_ENABLED === "true" &&
      value.NODE_ENV === "production" &&
      !value.CLIENT_ORIGIN.startsWith("https://")
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Production authentication requires an HTTPS client origin.",
        path: ["CLIENT_ORIGIN"],
      });
    }
  });
export const config = schema.parse(process.env);
