import { PDFDocument } from "pdf-lib";
import { Router } from "express";
import { z } from "zod";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { certificateSchema } from "./certificates.js";
import { institution, institutionSchema } from "./institution.js";
import { certificatePdf } from "./pdf.js";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine(
    (value) => Buffer.byteLength(value) <= 72,
    "Password must be at most 72 UTF-8 bytes",
  );
export function productionRoutes({
  db,
  service,
  requireAdmin,
  limiter,
  credentials,
  cookieOptions,
  ok,
  fail,
  publicOrigin,
  mfa,
}) {
  const router = Router();
  const put = (key, value) =>
    db
      .prepare(
        "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      )
      .run(key, JSON.stringify(value));
  const lock = async () => {
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
  };
  const confirm = async (password, code) => {
    const admin = await credentials();
    if (
      !admin.passwordHash ||
      !(await bcrypt.compare(password, admin.passwordHash))
    )
      throw Object.assign(new Error("Current password is incorrect."), {
        status: 401,
      });
    await mfa.verify(code);
    return admin;
  };
  router.get("/institution", async (req, res) =>
    ok(res, await institution(db)),
  );
  router.put(
    "/institution",
    requireAdmin,
    limiter(10, 60000, "settings"),
    async (req, res) => {
      const input = institutionSchema.parse(req.body);
      if (input.logo) {
        try {
          const bytes = Buffer.from(input.logo.split(",")[1], "base64");
          if (bytes.length > 48000) throw new Error("size");
          if (
            bytes.length < 24 ||
            !bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
            bytes.readUInt32BE(16) > 2048 ||
            bytes.readUInt32BE(20) > 2048
          )
            throw new Error("dimensions");
          const document = await PDFDocument.create();
          const image = await document.embedPng(bytes);
          if (image.width > 2048 || image.height > 2048)
            throw new Error("dimensions");
        } catch {
          return fail(
            res,
            "Choose a valid PNG logo under 48 KB and 2048 pixels per side.",
            400,
          );
        }
      }
      await put("institution", input);
      ok(res, input);
    },
  );
  router.get(
    "/certificates/:id/pdf",
    requireAdmin,
    limiter(20, 60000, "pdf"),
    async (req, res) => {
      const raw = await service.get(req.params.id);
      if (!raw) return fail(res, "Certificate not found", 404);
      const c = service.present(raw);
      if (c.status === "Invalid")
        return fail(res, "Certificate integrity check failed", 409);
      const origin = publicOrigin || `${req.protocol}://${req.get("host")}`;
      const bytes = await certificatePdf(c, origin, db);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${c.id}.pdf"`,
      });
      res.send(bytes);
    },
  );
  const rowsSchema = z.object({ rows: z.array(z.unknown()).min(1).max(100) });
  const preview = async (rows) => {
    const errors = [],
      normalized = [];
    const seen = new Set();
    for (const [index, row] of rows.entries()) {
      const result = certificateSchema.safeParse(row);
      if (!result.success) {
        errors.push({
          row: index + 1,
          message: result.error.issues
            .map((x) => `${x.path.join(".")}: ${x.message}`)
            .join("; "),
        });
        continue;
      }
      const c = {
        ...result.data,
        email: result.data.email.toLowerCase(),
        expiresAt: result.data.expiresAt || null,
      };
      const identity = JSON.stringify([c.email, c.course, c.issuedAt]);
      if (seen.has(identity))
        errors.push({
          row: index + 1,
          message:
            "Duplicate recipient, achievement, and issue date in this batch.",
        });
      seen.add(identity);
      const old = await db
        .prepare(
          "SELECT id FROM certificates WHERE LOWER(email) = ? AND course = ? AND issuedAt = ? AND revokedAt IS NULL LIMIT 1",
        )
        .get(c.email, c.course, c.issuedAt);
      if (old)
        errors.push({
          row: index + 1,
          message:
            "A certificate already exists for this recipient, achievement, and issue date.",
        });
      normalized.push(c);
    }
    return { rows: normalized, errors, total: rows.length };
  };
  router.post(
    "/certificates/bulk/preview",
    requireAdmin,
    limiter(10, 60000, "bulk-preview"),
    async (req, res) => ok(res, await preview(rowsSchema.parse(req.body).rows)),
  );
  router.post(
    "/certificates/bulk",
    requireAdmin,
    limiter(5, 60000, "bulk"),
    async (req, res) => {
      const input = rowsSchema
        .extend({ key: z.string().uuid() })
        .strict()
        .parse(req.body);
      const fingerprint = digest(JSON.stringify(input.rows));
      const result = await db.transaction(async () => {
        // The shared lock prevents concurrent batches from issuing duplicates.
        await lock();
        const old = await db
          .prepare("SELECT * FROM issuance_batches WHERE key = ?")
          .get(input.key);
        if (old) {
          if (old.digest !== fingerprint)
            throw Object.assign(
              new Error(
                "This request key was already used for a different batch.",
              ),
              { status: 409 },
            );
          return JSON.parse(old.result);
        }
        const review = await preview(input.rows);
        if (review.errors.length)
          throw Object.assign(
            new Error(
              review.errors.map((e) => `Row ${e.row}: ${e.message}`).join("\n"),
            ),
            { status: 400 },
          );
        const issued = [];
        for (const row of review.rows) issued.push(await service.issue(row));
        await db
          .prepare(
            "INSERT INTO issuance_batches (key,digest,result,createdAt) VALUES (?,?,?,?)",
          )
          .run(
            input.key,
            fingerprint,
            JSON.stringify(issued),
            new Date().toISOString(),
          );
        return issued;
      });
      ok(res, result, 201);
    },
  );
  router.post(
    "/recovery-codes",
    requireAdmin,
    limiter(5, 900000, "recovery-codes"),
    async (req, res) => {
      const { currentPassword, code } = z
        .object({
          currentPassword: z.string().min(1).max(128),
          code: z
            .string()
            .regex(/^\d{6}$/)
            .optional(),
        })
        .strict()
        .parse(req.body);
      const codes = Array.from({ length: 10 }, () =>
        randomBytes(16)
          .toString("hex")
          .match(/.{1,8}/g)
          .join("-"),
      );
      await db.transaction(async () => {
        await lock();
        await confirm(currentPassword, code);
        await put(
          "recoveryCodes",
          codes.map((code) => digest(code.replaceAll("-", ""))),
        );
      });
      ok(res, { codes });
    },
  );
  router.post("/recover", limiter(5, 900000, "recover"), async (req, res) => {
    const input = z
      .object({
        email: z.string().email().max(254),
        code: z.string().trim().max(80),
        newPassword: passwordSchema,
      })
      .strict()
      .parse(req.body);
    await db.transaction(async () => {
      await lock();
      const admin = await credentials();
      const saved = await db
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("recoveryCodes");
      const hashes = saved ? JSON.parse(saved.value) : [];
      const supplied = Buffer.from(
        digest(input.code.replaceAll("-", "").toLowerCase()),
        "hex",
      );
      const index = hashes.findIndex((value) =>
        timingSafeEqual(Buffer.from(value, "hex"), supplied),
      );
      if (index < 0 || input.email.toLowerCase() !== admin.email.toLowerCase())
        throw Object.assign(new Error("Email or recovery code is incorrect."), {
          status: 401,
        });
      hashes.splice(index, 1);
      await db
        .prepare("DELETE FROM settings WHERE key IN (?,?)")
        .run("adminMfa", "pendingAdminMfa");
      await put("recoveryCodes", hashes);
      await put("adminCredentials", {
        email: admin.email,
        passwordHash: await bcrypt.hash(input.newPassword, 12),
      });
      await db.prepare("DELETE FROM sessions").run();
    });
    res.clearCookie("credence_session", cookieOptions);
    ok(res, { changed: true });
  });
  router.post(
    "/sessions/revoke",
    requireAdmin,
    limiter(5, 900000, "sessions-revoke"),
    async (req, res) => {
      const { currentPassword, code } = z
        .object({
          currentPassword: z.string().min(1).max(128),
          code: z
            .string()
            .regex(/^\d{6}$/)
            .optional(),
        })
        .strict()
        .parse(req.body);
      await db.transaction(async () => {
        await lock();
        await confirm(currentPassword, code);
        await db.prepare("DELETE FROM sessions").run();
      });
      res.clearCookie("credence_session", cookieOptions);
      ok(res, { revoked: true });
    },
  );
  return router;
}
