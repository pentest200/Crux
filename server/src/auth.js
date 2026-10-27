import { Router } from "express";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { isAllowedOrigin } from "./origin.js";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, maxlength: 254 },
    name: { type: String, required: true, maxlength: 80 },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true, bufferCommands: false },
);
const sessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { bufferCommands: false },
);
export const User = mongoose.models.User || mongoose.model("User", userSchema);
export const AuthSession =
  mongoose.models.AuthSession || mongoose.model("AuthSession", sessionSchema);

const digest = (value) => createHash("sha256").update(value).digest("hex");
const publicUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
});
const password = z
  .string()
  .min(15)
  .max(72)
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72 && !value.includes("\0"),
  );
const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password,
});
const registration = credentials
  .extend({ name: z.string().trim().min(1).max(80) })
  .strict();
const lifetime = 8 * 60 * 60;
// Constant dummy hash avoids a fast return for unknown email addresses.
const dummyHash = bcrypt.hashSync(randomBytes(32).toString("hex"), 12);

export const mongoAuthStore = {
  findUserByEmail: (email) =>
    User.findOne({ email }).select("+passwordHash").lean(),
  findUserById: (id) => User.findById(id).lean(),
  createUser: (values) => User.create(values),
  createSession: (values) => AuthSession.create(values),
  findSession: (tokenHash) =>
    AuthSession.findOne({ tokenHash, expiresAt: { $gt: new Date() } }).lean(),
  deleteSession: (tokenHash) => AuthSession.deleteOne({ tokenHash }),
};

export function createAuthRouter(settings, store = mongoAuthStore) {
  const router = Router();
  const enabled = settings.AUTH_ENABLED === "true";
  const secure = settings.NODE_ENV === "production";
  const cookieName = secure ? "__Host-ghost_session" : "ghost_session";
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
  };
  const clearCookie = (res) => res.clearCookie(cookieName, cookieOptions);
  const cookieToken = (req) => {
    const values = (req.headers.cookie || "")
      .split(";")
      .map((item) => item.trim())
      .filter((item) => item.startsWith(cookieName + "="));
    return values.length === 1 ? values[0].slice(cookieName.length + 1) : null;
  };
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.get("/status", (_req, res) => res.json({ enabled }));
  router.use((_req, res, next) =>
    enabled
      ? next()
      : res
          .status(503)
          .json({ error: "Accounts are not configured on this server." }),
  );
  router.use((req, res, next) => {
    if (req.method === "GET") return next();
    if (
      !isAllowedOrigin(settings, req.get("Origin")) ||
      req.get("x-ghost-auth") !== "1" ||
      !req.is("application/json")
    ) {
      return res
        .status(403)
        .json({ error: "Request origin or content type is not allowed." });
    }
    next();
  });
  const ipLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again later." },
  });
  const accountLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    keyGenerator: (req) =>
      digest(
        String(req.body?.email || "")
          .trim()
          .toLowerCase(),
      ),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again later." },
  });

  async function issueSession(user, res) {
    const jti = randomBytes(32).toString("hex");
    const token = jwt.sign({}, settings.AUTH_JWT_SECRET, {
      algorithm: "HS256",
      subject: String(user._id),
      jwtid: jti,
      issuer: "ghost-files",
      audience: "ghost-files-client",
      expiresIn: lifetime,
    });
    await store.createSession({
      tokenHash: digest(jti),
      userId: user._id,
      expiresAt: new Date(Date.now() + lifetime * 1000),
    });
    res.cookie(cookieName, token, {
      ...cookieOptions,
      maxAge: lifetime * 1000,
    });
  }
  async function readSession(req) {
    const token = cookieToken(req);
    if (!token) return null;
    let claims;
    try {
      claims = jwt.verify(token, settings.AUTH_JWT_SECRET, {
        algorithms: ["HS256"],
        issuer: "ghost-files",
        audience: "ghost-files-client",
      });
      if (
        typeof claims.sub !== "string" ||
        !/^[a-f0-9]{24}$/.test(claims.sub) ||
        typeof claims.jti !== "string" ||
        !/^[a-f0-9]{64}$/.test(claims.jti)
      )
        return null;
    } catch {
      return null;
    }
    const session = await store.findSession(digest(claims.jti));
    if (!session || String(session.userId) !== claims.sub) return null;
    const user = await store.findUserById(claims.sub);
    return user ? { user, tokenHash: digest(claims.jti) } : null;
  }
  router.requireSession = async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!enabled)
      return res
        .status(503)
        .json({ error: "Accounts are not configured on this server." });
    const session = await readSession(req);
    if (!session) {
      clearCookie(res);
      return res
        .status(401)
        .json({ error: "Log in to download your results." });
    }
    req.authUser = publicUser(session.user);
    next();
  };
  router.post("/download", router.requireSession, (_req, res) =>
    res.status(204).end(),
  );
  router.post("/signup", ipLimit, accountLimit, async (req, res) => {
    const input = registration.safeParse(req.body);
    if (!input.success)
      return res.status(400).json({
        error:
          "Enter a name, valid email, and password of 15–72 characters (maximum 72 UTF-8 bytes).",
      });
    const { email, name, password } = input.data;
    const passwordHash = await bcrypt.hash(password, 12);
    let user;
    try {
      user = await store.createUser({ email, name, passwordHash });
    } catch (error) {
      if (error.code === 11000)
        return res
          .status(400)
          .json({ error: "Unable to create an account with these details." });
      throw error;
    }
    await issueSession(user, res);
    res.status(201).json({ user: publicUser(user) });
  });
  router.post("/login", ipLimit, accountLimit, async (req, res) => {
    const input = credentials.strict().safeParse(req.body);
    if (!input.success)
      return res.status(401).json({ error: "Email or password is incorrect." });
    const user = await store.findUserByEmail(input.data.email);
    const matches = await bcrypt.compare(
      input.data.password,
      user?.passwordHash || dummyHash,
    );
    if (!user || !matches)
      return res.status(401).json({ error: "Email or password is incorrect." });
    await issueSession(user, res);
    res.json({ user: publicUser(user) });
  });
  router.get("/me", async (req, res) => {
    const session = await readSession(req);
    if (!session) {
      clearCookie(res);
      return res.status(401).json({ error: "Sign in again." });
    }
    res.json({ user: publicUser(session.user) });
  });
  router.post("/logout", async (req, res) => {
    const session = await readSession(req);
    if (session) await store.deleteSession(session.tokenHash);
    clearCookie(res);
    res.status(204).end();
  });
  return router;
}
