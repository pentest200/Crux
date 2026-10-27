import { Schema, model } from "mongoose";
const jobSchema = new Schema(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    kind: { type: String, required: true, enum: ["office-to-pdf"] },
    status: {
      type: String,
      required: true,
      enum: ["accepted", "completed", "failed", "expired"],
    },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 },
  },
  { versionKey: false },
);
export const Job = model("Job", jobSchema);
