import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createAuthRouter } from "./auth.js";

test("development login accepts both Vite ports; production remains exact-origin only", async () => {
  for (const NODE_ENV of ["development", "production"]) {
    const app = express();
    app.use(express.json());
    app.use(
      "/auth",
      createAuthRouter({
        AUTH_ENABLED: "true",
        NODE_ENV,
        CLIENT_ORIGIN:
          NODE_ENV === "production"
            ? "https://ghost.example.test"
            : "http://localhost:5173",
      }),
    );
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    try {
      for (const origin of [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "https://ghost.example.test",
        "https://evil.test",
        "http://localhost.evil.test:5174",
        "http://localhost:9999",
        "null",
        "",
      ]) {
        const allowed =
          NODE_ENV === "development"
            ? [
                "http://localhost:5173",
                "http://localhost:5174",
                "http://127.0.0.1:5174",
              ].includes(origin)
            : origin === "https://ghost.example.test";
        const response = await fetch(
          `http://127.0.0.1:${server.address().port}/auth/login`,
          {
            method: "POST",
            headers: {
              Origin: origin,
              "Content-Type": "application/json",
              "x-ghost-auth": "1",
            },
            body: "{}",
          },
        );
        assert.equal(
          response.status,
          allowed ? 401 : 403,
          `${NODE_ENV}: ${origin}`,
        );
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});
