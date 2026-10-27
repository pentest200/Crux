import test from "node:test";
import assert from "node:assert/strict";
import { conversionError } from "./conversion-response.js";

test("HTML gateway errors explain service availability instead of blaming the file", async () => {
  for (const status of [502, 503, 504]) {
    const error = await conversionError(
      new Response("<html>upstream failure</html>", { status }),
    );
    assert.equal(error.status, status);
    assert.match(error.message, new RegExp(`HTTP ${status}`));
    assert.ok(!error.message.includes("<html>"));
  }
});

test("conversion errors retain API validation details and handle invalid JSON shapes", async () => {
  assert.equal(
    (
      await conversionError(
        Response.json({ error: "Invalid Office archive." }, { status: 415 }),
      )
    ).message,
    "Invalid Office archive.",
  );
  assert.match(
    (await conversionError(Response.json({ error: {} }, { status: 500 })))
      .message,
    /HTTP 500/,
  );
  assert.match(
    (await conversionError(new Response("", { status: 401 }))).message,
    /session expired/,
  );
});
