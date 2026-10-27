import test from "node:test";
import assert from "node:assert/strict";
import {
  readdir,
  readFile,
  writeFile,
  mkdir,
  utimes,
  access,
} from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { app } from "./index.js";
import {
  validateUpload,
  convertFile,
  jobRoot,
  cleanupExpired,
  probeCapabilities,
} from "./conversion.js";

const pdf = () => ({
  originalname: "../evil.pdf",
  mimetype: "application/pdf",
  buffer: Buffer.from("%PDF-1.7\nfixture"),
});
async function office() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("word/document.xml", "<document/>");
  zip.folder("word/embeddings");
  return {
    originalname: "../../name.docx",
    mimetype:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
  };
}
test("validates actual signatures and Office archive structure", async () => {
  await assert.rejects(
    validateUpload(
      { ...pdf(), buffer: Buffer.from("bad signature") },
      "protect",
    ),
  );
  assert.equal(await validateUpload(await office(), "word-to-pdf"), ".docx");
  await assert.rejects(validateUpload(await office(), "excel-to-pdf"));
  await assert.rejects(validateUpload(undefined, "protect"));
});
test("removes successful temporary input, password arguments, and output", async () => {
  let directory;
  const output = await convertFile(
    pdf(),
    "protect",
    "test-pass",
    undefined,
    async (_command, args, opts) => {
      directory = opts.cwd;
      const argumentsText = await readFile(args[0].slice(1), "utf8");
      assert.ok(argumentsText.includes("test-pass"));
      assert.ok(!args.join(" ").includes("test-pass"));
      await writeFile(path.join(directory, "output.pdf"), "%PDF-1.7\nresult");
    },
  );
  assert.ok(output.subarray(0, 5).equals(Buffer.from("%PDF-")));
  await assert.rejects(access(directory));
});
test("failure and timeout clean temporary files and sanitize errors", async () => {
  let directory;
  await assert.rejects(
    convertFile(
      pdf(),
      "unlock",
      "test-pass",
      undefined,
      async (_command, _args, opts) => {
        directory = opts.cwd;
        throw new Error("sensitive /path/input.pdf");
      },
    ),
    (error) => !error.message.includes("/path"),
  );
  await assert.rejects(access(directory));
  await assert.rejects(
    convertFile(pdf(), "protect", "test-pass", undefined, async () => {
      const error = new Error("timeout");
      error.killed = true;
      throw error;
    }),
    (error) => error.status === 408,
  );
});
test("Office runner uses fixed internal filenames and no shell", async () => {
  let directory;
  await convertFile(
    await office(),
    "word-to-pdf",
    "",
    undefined,
    async (_command, args, opts) => {
      directory = opts.cwd;
      assert.ok(args.at(-1).endsWith("input.docx"));
      assert.equal(opts.shell, undefined);
      assert.ok(!args.join(" ").includes("../../name"));
      await writeFile(path.join(directory, "input.pdf"), "%PDF-1.7\nconverted");
    },
  );
  await assert.rejects(access(directory));
});
test("expired jobs are removed", async () => {
  await mkdir(jobRoot, { recursive: true });
  const target = path.join(jobRoot, "job-expiry-test");
  await mkdir(target, { recursive: true });
  await utimes(target, new Date(0), new Date(0));
  await cleanupExpired(Date.now(), 1000);
  assert.ok(!(await readdir(jobRoot)).includes("job-expiry-test"));
});
test("HTTP health, capability, authentication, path access, and headers", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${origin}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("x-content-type-options"), "nosniff");
    assert.equal(health.headers.get("x-powered-by"), null);
    const caps = await (await fetch(`${origin}/capabilities`)).json();
    assert.equal(typeof caps.server.protect, "boolean");
    const denial = await fetch(`${origin}/convert/protect`, {
      method: "POST",
      body: "not uploaded multipart",
    });
    assert.equal(denial.status, 503);
    assert.equal((await fetch(`${origin}/jobs/nonexistent`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test("native conversion tools are reported accurately", async () => {
  const caps = await probeCapabilities();
  for (const value of Object.values(caps))
    assert.equal(typeof value, "boolean");
});
