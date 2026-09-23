import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { certificateSchema, createCertificateService } from "./certificates.js";

export function createApp({
  db,
  secret,
  adminEmail = "",
  passwordHash = "",
  demoMode = true,
  production = false,
}) {
  const app = express();
  const service = createCertificateService(db, secret);
  if (demoMode) service.seed();
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
  app.use("/api", (req, res, next) => {
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
    const token = req.cookies.credence_session;
    req.admin = Boolean(
      typeof token === "string" &&
      db
        .prepare(
          "SELECT tokenHash FROM sessions WHERE tokenHash = ? AND expiresAt > ?",
        )
        .get(hash(token), Date.now()),
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
  const limiter = (limit, windowMs) =>
    rateLimit({
      limit,
      windowMs,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      handler: (req, res) =>
        fail(res, "Too many requests. Please try again later.", 429),
    });
  app.get("/api/session", (req, res) =>
    ok(res, {
      role: req.admin ? "admin" : "viewer",
      email: req.admin ? adminEmail : null,
      demoMode,
      configured: Boolean(adminEmail && passwordHash),
    }),
  );
  app.post("/api/login", limiter(10, 15 * 60 * 1000), async (req, res) => {
    const { email, password } = z
      .object({
        email: z.string().email().max(254),
        password: z.string().min(1).max(128),
      })
      .parse(req.body);
    if (!adminEmail || !passwordHash)
      return fail(
        res,
        "Administrator access has not been configured. Follow the setup instructions in README.md.",
        503,
      );
    const passwordValid = await bcrypt.compare(password, passwordHash);
    if (email.toLowerCase() !== adminEmail.toLowerCase() || !passwordValid)
      return fail(res, "Email or password is incorrect.", 401);
    db.prepare("DELETE FROM sessions WHERE expiresAt <= ?").run(Date.now());
    if (req.cookies.credence_session)
      db.prepare("DELETE FROM sessions WHERE tokenHash = ?").run(
        hash(req.cookies.credence_session),
      );
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES (?, ?)").run(
      hash(token),
      Date.now() + 8 * 3600000,
    );
    res.cookie("credence_session", token, {
      ...cookieOptions,
      maxAge: 8 * 3600000,
    });
    ok(res, { role: "admin" });
  });
  app.post("/api/logout", (req, res) => {
    if (req.cookies.credence_session)
      db.prepare("DELETE FROM sessions WHERE tokenHash = ?").run(
        hash(req.cookies.credence_session),
      );
    res.clearCookie("credence_session", cookieOptions);
    ok(res, null);
  });
  app.get("/api/certificates", canRead, (req, res) =>
    ok(res, service.list(!req.admin)),
  );
  app.post("/api/certificates", requireAdmin, (req, res) =>
    ok(res, service.issue(certificateSchema.parse(req.body)), 201),
  );
  app.post("/api/certificates/:id/revoke", requireAdmin, (req, res) => {
    const { reason } = z
      .object({ reason: z.string().trim().min(5).max(300) })
      .parse(req.body);
    ok(res, service.revoke(req.params.id, reason));
  });
  app.get("/api/activity", canRead, (req, res) =>
    ok(res, service.activity(!req.admin)),
  );
  app.get("/api/verify/:id", limiter(60, 60000), (req, res) => {
    const id = z
      .string()
      .regex(/^CRD-\d{4}-[A-Z0-9]{4,16}$/)
      .parse(req.params.id.toUpperCase());
    const certificate = service.verify(id);
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
    if (status >= 500) console.error(error);
    fail(
      res,
      status >= 500 ? "Something went wrong. Please try again." : error.message,
      status,
    );
  });
  return app;
}
