import { z } from "zod";
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017/ghost-files"),
  MONGODB_ENABLED: z.enum(["true", "false"]).default("false"),
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
});
export const config = schema.parse(process.env);
