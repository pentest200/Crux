import test from "node:test";
import assert from "node:assert/strict";
import { app } from "./index.js";
import { convertFile } from "./conversion.js";

test("qpdf argument files cannot be selected through a password", async () => {
  const file = {
    originalname: "test.pdf",
    mimetype: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nfixture"),
  };
  await assert.rejects(
    convertFile(file, "protect", "@private-file"),
    (error) => error.status === 400,
  );
});
test("conversion endpoint enforces the request rate limit", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/convert/protect`;
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const response = await fetch(url, { method: "POST" });
      if (response.status === 429) {
        limited = true;
        assert.ok(response.headers.get("ratelimit"));
        break;
      }
    }
    assert.equal(limited, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
