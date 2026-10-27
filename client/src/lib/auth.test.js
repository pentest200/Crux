import test from "node:test";
import assert from "node:assert/strict";
import { authRequest } from "./auth.js";

test("signup and login never replay mutations after gateway or network failures", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const path of ["signup", "login"]) {
      for (const status of [502, 503, 504, "network"]) {
        let calls = 0;
        globalThis.fetch = async () => {
          calls++;
          if (status === "network") throw new TypeError("Network failure");
          return new Response("{}", { status });
        };
        await assert.rejects(authRequest(path, {}));
        assert.equal(calls, 1);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
