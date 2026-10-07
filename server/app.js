import express from "express";
import helmet from "helmet";
import { asyncDatabase } from "./storage.js";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { certificateSchema, createCertificateService } from "./certificates.js";

export function createApp({
  db,
  secret,
  adminEmail = "",
  passwordHash = "",
  demoMode = true,
  production = false,
  trustProxy = false,
  setupToken = "",
  setupExpiresAt = 0,
}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", trustProxy);
  db = asyncDatabase(db);
  const service = createCertificateService(db, secret);
  const ready = demoMode ? service.seed() : Promise.resolve();
  ready.catch(() => {});
  app.use(async (req, res, next) => {
    await ready;
    next();
  });
  app.use(helmet({ contentSecurityPolicy: production ? undefined : false }));
  app.use(express.json({ limit: "16kb" }), cookieParser());
  const hash = (token) => createHash("sha256").update(token).digest("hex");
  const ok = (res, data, code = 200) =>
    res.status(code).json({ success: true, data });
  const fail = (res, error, code) =>
    res.status(code).json({ success: false, error, code });
  const cookieOptions = {
    httpOnly: true,
    sameSite: "strict",
    secure: production,
    path: "/",
  };
  app.use("/api", async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin
    ) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host)
          return fail(res, "Cross-origin requests are not allowed", 403);
      } catch {
        return fail(res, "Invalid origin", 403);
      }
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (req.headers["sec-fetch-site"] === "cross-site" ||
        (production && req.cookies.credence_session && !req.headers.origin))
    )
      return fail(res, "Same-origin requests are required", 403);
    const token = req.cookies.credence_session;
    req.admin = Boolean(
      typeof token === "string" &&
      (await db
        .prepare(
          "SELECT tokenHash FROM sessions WHERE tokenHash = ? AND expiresAt > ?",
        )
        .get(hash(token), Date.now())),
    );
    next();
  });
  const requireAdmin = (req, res, next) =>
    req.admin
      ? next()
      : fail(res, "Sign in as an administrator to make changes.", 401);
  const canRead = (req, res, next) =>
    req.admin || demoMode
      ? next()
      : fail(res, "Please sign in to view the workspace.", 401);
  const limiter = (limit, windowMs, scope) => async (req, res, next) => {
    const now = Date.now();
    const key = hash(`${scope}:${req.ip}`);
    const bucket = await db
      .prepare(
        `INSERT INTO rate_limits (key,hits,resetAt) VALUES (?,1,?)
      ON CONFLICT (key) DO UPDATE SET
      hits = CASE WHEN rate_limits.resetAt <= ? THEN 1 ELSE rate_limits.hits + 1 END,
      resetAt = CASE WHEN rate_limits.resetAt <= ? THEN excluded.resetAt ELSE rate_limits.resetAt END
      RETURNING hits,resetAt`,
      )
      .get(key, now + windowMs, now, now);
    if (bucket.hits > limit) {
      res.set(
        "Retry-After",
        String(Math.max(1, Math.ceil((Number(bucket.resetAt) - now) / 1000))),
      );
      return fail(res, "Too many requests. Please try again later.", 429);
    }
    if (Math.random() < 0.01)
      await db.prepare("DELETE FROM rate_limits WHERE resetAt < ?").run(now);
    next();
  };
  const credentials = async () => {
    const saved = await db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get("adminCredentials");
    return saved
      ? JSON.parse(saved.value)
      : { email: adminEmail, passwordHash };
  };
  app.get("/api/session", async (req, res) => {
    const admin = await credentials();
    ok(res, {
      role: req.admin ? "admin" : "viewer",
      email: req.admin ? admin.email : null,
      demoMode,
      storage: db.dialect === "postgres" ? "Hosted PostgreSQL" : "Local SQLite",
      configured: Boolean(admin.email && admin.passwordHash),
      setupAvailable: Boolean(
        setupToken && Date.now() < setupExpiresAt && !admin.passwordHash,
      ),
    });
  });
  app.get("/api/health", async (req, res) => {
    await db.prepare("SELECT 1 AS ready").get();
    ok(res, { status: "ok" });
  });
  const strongPassword = z
    .string()
    .min(12)
    .max(128)
    .refine(
      (value) => Buffer.byteLength(value, "utf8") <= 72,
      "Password must be at most 72 UTF-8 bytes",
    );
  app.post(
    "/api/setup",
    limiter(5, 15 * 60 * 1000, "setup"),
    async (req, res) => {
      const input = z
        .object({
          token: z.string().max(256),
          email: z.string().trim().email().max(254),
          password: strongPassword,
        })
        .strict()
        .parse(req.body);
      const supplied = Buffer.from(hash(input.token), "hex");
      const expected = Buffer.from(hash(setupToken), "hex");
      if (
        !setupToken ||
        Date.now() >= setupExpiresAt ||
        !timingSafeEqual(supplied, expected)
      )
        return fail(res, "Setup link is invalid or expired.", 403);
      const encrypted = await bcrypt.hash(input.password, 12);
      await db.transaction(async () => {
        await db
          .prepare(
            "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT (key) DO NOTHING",
          )
          .run("adminSetupLock", "1");
        await db
          .prepare(
            `SELECT value FROM settings WHERE key = ?${db.dialect === "postgres" ? " FOR UPDATE" : ""}`,
          )
          .get("adminSetupLock");
        if ((await credentials()).passwordHash)
          throw Object.assign(
            new Error("Administrator is already configured."),
            { status: 409 },
          );
        await db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run(
          "adminCredentials",
          JSON.stringify({
            email: input.email.toLowerCase(),
            passwordHash: encrypted,
          }),
        );
      });
      ok(res, { configured: true }, 201);
    },
  );
  app.post(
    "/api/login",
    limiter(10, 15 * 60 * 1000, "login"),
    async (req, res) => {
      const { email, password } = z
        .object({
          email: z.string().email().max(254),
          password: z
            .string()
            .min(1)
            .max(128)
            .refine(
              (value) => Buffer.byteLength(value, "utf8") <= 72,
              "Password exceeds supported length",
            ),
        })
        .parse(req.body);
      const token = randomBytes(32).toString("hex");
      await db.transaction(async () => {
        await db
          .prepare(
            "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT (key) DO NOTHING",
          )
          .run("adminSetupLock", "1");
        await db
          .prepare(
            `SELECT value FROM settings WHERE key = ?${db.dialect === "postgres" ? " FOR UPDATE" : ""}`,
          )
          .get("adminSetupLock");
        const admin = await credentials();
        if (!admin.email || !admin.passwordHash)
          throw Object.assign(
            new Error("Administrator setup has not been completed."),
            { status: 503 },
          );
        const passwordValid = await bcrypt.compare(
          password,
          admin.passwordHash,
        );
        if (email.toLowerCase() !== admin.email.toLowerCase() || !passwordValid)
          throw Object.assign(new Error("Email or password is incorrect."), {
            status: 401,
          });
        await db
          .prepare("DELETE FROM sessions WHERE expiresAt <= ?")
          .run(Date.now());
        if (req.cookies.credence_session)
          await db
            .prepare("DELETE FROM sessions WHERE tokenHash = ?")
            .run(hash(req.cookies.credence_session));
        await db
          .prepare("INSERT INTO sessions VALUES (?, ?)")
          .run(hash(token), Date.now() + 8 * 3600000);
      });
      res.cookie("credence_session", token, {
        ...cookieOptions,
        maxAge: 8 * 3600000,
      });
      ok(res, { role: "admin" });
    },
  );
  app.post(
    "/api/password",
    requireAdmin,
    limiter(5, 15 * 60 * 1000, "password"),
    async (req, res) => {
      const input = z
        .object({
          currentPassword: z.string().min(1).max(128),
          newPassword: strongPassword,
        })
        .strict()
        .parse(req.body);
      await db.transaction(async () => {
        await db
          .prepare(
            "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT (key) DO NOTHING",
          )
          .run("adminSetupLock", "1");
        await db
          .prepare(
            `SELECT value FROM settings WHERE key = ?${db.dialect === "postgres" ? " FOR UPDATE" : ""}`,
          )
          .get("adminSetupLock");
        const admin = await credentials();
        if (!(await bcrypt.compare(input.currentPassword, admin.passwordHash)))
          throw Object.assign(new Error("Current password is incorrect."), {
            status: 401,
          });
        const passwordHash = await bcrypt.hash(input.newPassword, 12);
        await db
          .prepare(
            "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
          )
          .run(
            "adminCredentials",
            JSON.stringify({ email: admin.email, passwordHash }),
          );
        await db.prepare("DELETE FROM sessions").run();
      });
      res.clearCookie("credence_session", cookieOptions);
      ok(res, { changed: true });
    },
  );
  app.post("/api/logout", async (req, res) => {
    if (req.cookies.credence_session)
      await db
        .prepare("DELETE FROM sessions WHERE tokenHash = ?")
        .run(hash(req.cookies.credence_session));
    res.clearCookie("credence_session", cookieOptions);
    ok(res, null);
  });
  app.get("/api/certificates", canRead, async (req, res) =>
    ok(res, await service.list(!req.admin)),
  );
  app.post(
    "/api/certificates",
    requireAdmin,
    limiter(30, 60000, "issue"),
    async (req, res) =>
      ok(res, await service.issue(certificateSchema.parse(req.body)), 201),
  );
  app.post(
    "/api/certificates/:id/revoke",
    requireAdmin,
    limiter(30, 60000, "revoke"),
    async (req, res) => {
      const { reason } = z
        .object({ reason: z.string().trim().min(5).max(300) })
        .parse(req.body);
      ok(res, await service.revoke(req.params.id, reason));
    },
  );
  app.get("/api/activity", canRead, async (req, res) =>
    ok(res, await service.activity(!req.admin)),
  );
  app.get("/api/verify/:id", limiter(60, 60000, "verify"), async (req, res) => {
    const id = z
      .string()
      .regex(/^CRD-\d{4}-[A-Z0-9]{4,16}$/)
      .parse(req.params.id.toUpperCase());
    const certificate = await service.verify(id);
    if (!certificate)
      return fail(
        res,
        "No certificate found. Check the ID and try again.",
        404,
      );
    ok(res, certificate);
  });
  app.use("/api", (req, res) => fail(res, "Endpoint not found", 404));
  app.use((error, req, res, next) => {
    if (error instanceof z.ZodError)
      return fail(
        res,
        error.issues
          .map((i) => `${i.path.join(".") || "Input"}: ${i.message}`)
          .join("; "),
        400,
      );
    const status = error.status || 500;
    if (status >= 500)
      console.error("API request failed", {
        code: error.code || "INTERNAL_ERROR",
      });
    fail(
      res,
      status >= 500 ? "Something went wrong. Please try again." : error.message,
      status,
    );
  });
  return app;
}
