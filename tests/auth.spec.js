import { test, expect } from "@playwright/test";
import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { createAuthRouter, User, AuthSession } from "../server/src/auth.js";

test("real account signup, reload, logout, and password verification", async ({
  page,
}) => {
  test.skip(
    !process.env.TEST_AUTH_MONGODB_URI,
    "Requires an isolated local MongoDB test server",
  );
  const dbName = "ghost_auth_test_" + randomUUID().replaceAll("-", "");
  await mongoose.connect(process.env.TEST_AUTH_MONGODB_URI, { dbName });
  let server;
  try {
    await Promise.all([User.init(), AuthSession.init()]);
    const app = express();
    app.use(express.json());
    app.use(
      "/auth",
      createAuthRouter({
        AUTH_ENABLED: "true",
        NODE_ENV: "test",
        CLIENT_ORIGIN: "http://127.0.0.1:5173",
        AUTH_JWT_SECRET: randomBytes(48).toString("hex"),
      }),
    );
    server = app.listen(8787, "127.0.0.1");
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill("Mongo Test User");
    await dialog
      .getByLabel("Email", { exact: true })
      .fill("browser@example.test");
    const password = "a unique browser test password!";
    await dialog.getByLabel("Password", { exact: true }).fill(password);
    await dialog
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText("Mongo Test User", { exact: true }),
    ).toBeVisible();
    const stored = await User.findOne({ email: "browser@example.test" })
      .select("+passwordHash")
      .lean();
    expect(await bcrypt.compare(password, stored.passwordHash)).toBe(true);
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(
      (cookie) => cookie.name === "ghost_session",
    );
    expect(sessionCookie.httpOnly).toBe(true);
    expect(sessionCookie.sameSite).toBe("Strict");
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      "ghost_session",
    );
    expect(
      await page.evaluate(() => localStorage.getItem("ghost-files-auth-token")),
    ).toBe(null);
    await page.reload();
    await expect(
      page.getByText("Mongo Test User", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Log in", exact: true }),
    ).toBeVisible();
    expect(await AuthSession.countDocuments()).toBe(0);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await dialog
      .getByLabel("Email", { exact: true })
      .fill("browser@example.test");
    await dialog
      .getByLabel("Password", { exact: true })
      .fill("the wrong password long enough");
    await dialog.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Email or password is incorrect.",
    );
    await dialog.getByLabel("Password", { exact: true }).fill(password);
    await dialog.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText("Mongo Test User", { exact: true }),
    ).toBeVisible();
  } finally {
    if (server?.listening)
      await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) {
      expect(mongoose.connection.name).toBe(dbName);
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
});
