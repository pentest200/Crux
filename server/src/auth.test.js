import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes, randomUUID } from "node:crypto";
import { createAuthRouter, User, AuthSession } from "./auth.js";

test("disabled authentication fails closed", async () => {
  const app = express();
  app.use(
    "/auth",
    createAuthRouter({ AUTH_ENABLED: "false", NODE_ENV: "test" }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    assert.deepEqual(await (await fetch(origin + "/auth/status")).json(), {
      enabled: false,
    });
    assert.equal(
      (await fetch(origin + "/auth/login", { method: "POST" })).status,
      503,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test(
  "MongoDB authentication, cookie security, validation, revocation and throttling",
  { skip: !process.env.TEST_AUTH_MONGODB_URI },
  async () => {
    const dbName = "ghost_auth_test_" + randomUUID().replaceAll("-", "");
    const settings = {
      AUTH_ENABLED: "true",
      NODE_ENV: "production",
      CLIENT_ORIGIN: "https://ghost.example.test",
      AUTH_JWT_SECRET: randomBytes(48).toString("hex"),
    };
    const password = "a unique test password 987!";
    await mongoose.connect(process.env.TEST_AUTH_MONGODB_URI, { dbName });
    await Promise.all([User.init(), AuthSession.init()]);
    const app = express();
    app.use(express.json());
    app.use("/auth", createAuthRouter(settings));
    app.use((_error, _req, res, _next) =>
      res.status(500).json({ error: "Unexpected server error." }),
    );
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const request = (path, body, cookie, extraHeaders = {}) =>
      fetch(origin + "/auth/" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: settings.CLIENT_ORIGIN,
          "x-ghost-auth": "1",
          ...(cookie ? { Cookie: cookie } : {}),
          ...extraHeaders,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    try {
      const badOrigin = await request(
        "signup",
        { name: "Tester", email: "test@example.test", password },
        null,
        { Origin: "https://evil.test" },
      );
      assert.equal(badOrigin.status, 403);
      assert.equal(
        (
          await request(
            "signup",
            { name: "Tester", email: "test@example.test", password },
            null,
            { "x-ghost-auth": "" },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request("signup", {
            name: "Tester",
            email: "short@example.test",
            password: "short",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request("signup", {
            name: "Tester",
            email: "wide@example.test",
            password: "😀".repeat(20),
          })
        ).status,
        400,
      );
      assert.equal(
        (await request("login", { email: { $ne: null }, password })).status,
        401,
      );
      const signup = await request("signup", {
        name: "Tester",
        email: " TEST@example.test ",
        password,
      });
      assert.equal(signup.status, 201);
      assert.equal(signup.headers.get("cache-control"), "no-store");
      const body = await signup.json();
      assert.deepEqual(Object.keys(body.user).sort(), ["email", "id", "name"]);
      assert.equal(body.user.email, "test@example.test");
      const stored = await User.findOne({ email: "test@example.test" })
        .select("+passwordHash")
        .lean();
      assert.notEqual(stored.passwordHash, password);
      assert.equal(bcrypt.getRounds(stored.passwordHash), 12);
      assert.equal(await bcrypt.compare(password, stored.passwordHash), true);
      assert.equal(stored.password, undefined);
      const setCookie = signup.headers.get("set-cookie");
      for (const flag of [
        "__Host-ghost_session=",
        "HttpOnly",
        "Secure",
        "SameSite=Strict",
        "Path=/",
      ])
        assert.ok(setCookie.includes(flag), flag);
      const cookie = setCookie.split(";")[0];
      assert.equal((await request("me", undefined, cookie)).status, 200);
      assert.equal(
        (await request("me", undefined, cookie.slice(0, -1) + "!")).status,
        401,
      );
      const claims = jwt.verify(cookie.split("=")[1], settings.AUTH_JWT_SECRET);
      assert.equal(claims.exp - claims.iat, 8 * 60 * 60);
      const expired = jwt.sign({}, settings.AUTH_JWT_SECRET, {
        algorithm: "HS256",
        subject: stored._id.toString(),
        jwtid: claims.jti,
        issuer: "ghost-files",
        audience: "ghost-files-client",
        expiresIn: -1,
      });
      assert.equal(
        (await request("me", undefined, "__Host-ghost_session=" + expired))
          .status,
        401,
      );
      const session = await AuthSession.findOne().lean();
      assert.notEqual(session.tokenHash, claims.jti);
      assert.equal(session.token, undefined);
      assert.equal(
        (
          await request("login", {
            email: stored.email,
            password: "wrong password long enough",
          })
        ).status,
        401,
      );
      assert.equal(
        (await request("login", { email: "missing@example.test", password }))
          .status,
        401,
      );
      const duplicate = await request("signup", {
        name: "Other",
        email: stored.email,
        password,
      });
      assert.equal(duplicate.status, 400);
      const logout = await request("logout", {}, cookie);
      assert.equal(logout.status, 204);
      assert.equal((await request("me", undefined, cookie)).status, 401);
      assert.equal(await AuthSession.countDocuments(), 0);
      const login = await request("login", { email: stored.email, password });
      assert.equal(login.status, 200);
      assert.equal(
        (
          await request(
            "me",
            undefined,
            login.headers.get("set-cookie").split(";")[0],
          )
        ).status,
        200,
      );
      for (let index = 0; index < 10; index++)
        await request("login", { email: "rate@example.test", password });
      assert.equal(
        (await request("login", { email: "rate@example.test", password }))
          .status,
        429,
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
      // Only the randomly named database created by this test is removed.
      assert.equal(mongoose.connection.name, dbName);
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  },
);
