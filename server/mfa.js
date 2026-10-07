import {
  createHmac,
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes) {
  let bits = 0,
    value = 0,
    result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function decode(value) {
  let bits = 0,
    acc = 0;
  const bytes = [];
  for (const char of value) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid authenticator secret");
    acc = (acc << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((acc >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
export function totp(secret, counter, digits = 6) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", decode(secret)).update(bytes).digest();
  const offset = mac[mac.length - 1] & 15;
  return String(
    (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits,
  ).padStart(digits, "0");
}
export function validStep(secret, code, lastStep = -1, now = Date.now()) {
  if (!/^\d{6}$/.test(code || "")) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1])
    if (
      step > lastStep &&
      timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))
    )
      return step;
  return null;
}
export function mfaService(db, signingSecret) {
  const encryptionKey = createHash("sha256")
    .update("credence-mfa-v1\0" + signingSecret)
    .digest();
  const put = (key, value) =>
    db
      .prepare(
        "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      )
      .run(key, JSON.stringify(value));
  const get = async (key) => {
    const row = await db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key);
    return row ? JSON.parse(row.value) : null;
  };
  const seal = (text) => {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
    const data = Buffer.concat([cipher.update(text), cipher.final()]);
    return {
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    };
  };
  const open = (saved) => {
    const cipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey,
      Buffer.from(saved.iv, "base64"),
    );
    cipher.setAuthTag(Buffer.from(saved.tag, "base64"));
    return Buffer.concat([
      cipher.update(Buffer.from(saved.data, "base64")),
      cipher.final(),
    ]).toString();
  };
  const enabled = async () => Boolean(await get("adminMfa"));
  const verify = async (code) => {
    const saved = await get("adminMfa");
    if (!saved) return;
    const step = validStep(open(saved.secret), code, saved.lastStep);
    if (step === null)
      throw Object.assign(new Error("Enter a new valid authenticator code."), {
        status: 401,
      });
    await put("adminMfa", { ...saved, lastStep: step });
  };
  return { get, put, seal, open, enabled, verify };
}
export function mfaRoutes({
  db,
  mfa,
  credentials,
  requireAdmin,
  limiter,
  lock,
  ok,
  fail,
  cookieOptions,
}) {
  const router = Router();
  const passwordInput = z
    .object({
      currentPassword: z.string().min(1).max(128),
      code: z
        .string()
        .regex(/^\d{6}$/)
        .optional(),
    })
    .strict();
  const confirm = async (password) => {
    const admin = await credentials();
    if (!(await bcrypt.compare(password, admin.passwordHash)))
      throw Object.assign(new Error("Current password is incorrect."), {
        status: 401,
      });
    return admin;
  };
  router.get("/mfa", requireAdmin, async (req, res) =>
    ok(res, { enabled: await mfa.enabled() }),
  );
  router.post(
    "/mfa/enroll",
    requireAdmin,
    limiter(5, 900000, "mfa-enroll"),
    async (req, res) => {
      const input = passwordInput.parse(req.body);
      const result = await db.transaction(async () => {
        await lock();
        const admin = await confirm(input.currentPassword);
        if (await mfa.enabled())
          throw Object.assign(
            new Error("Two-factor authentication is already enabled."),
            { status: 409 },
          );
        const secret = base32(randomBytes(20));
        await mfa.put("pendingAdminMfa", {
          secret: mfa.seal(secret),
          expiresAt: Date.now() + 600000,
        });
        const uri = `otpauth://totp/${encodeURIComponent("Credence:" + admin.email)}?secret=${secret}&issuer=Credence&algorithm=SHA1&digits=6&period=30`;
        return {
          secret,
          qr: await QRCode.toDataURL(uri),
          expiresAt: Date.now() + 600000,
        };
      });
      ok(res, result);
    },
  );
  router.post(
    "/mfa/confirm",
    requireAdmin,
    limiter(5, 900000, "mfa-confirm"),
    async (req, res) => {
      const input = passwordInput
        .extend({ code: z.string().regex(/^\d{6}$/) })
        .parse(req.body);
      await db.transaction(async () => {
        await lock();
        await confirm(input.currentPassword);
        const saved = await mfa.get("pendingAdminMfa");
        if (!saved || saved.expiresAt <= Date.now() || (await mfa.enabled()))
          throw Object.assign(new Error("Enrollment expired. Start again."), {
            status: 409,
          });
        const step = validStep(mfa.open(saved.secret), input.code);
        if (step === null)
          throw Object.assign(new Error("Authenticator code is incorrect."), {
            status: 401,
          });
        const recovery = await mfa.get("recoveryCodes");
        if (!recovery?.length)
          throw Object.assign(
            new Error(
              "Save recovery codes before enabling two-factor authentication.",
            ),
            { status: 409 },
          );
        await mfa.put("adminMfa", { secret: saved.secret, lastStep: step });
        await db
          .prepare("DELETE FROM settings WHERE key = ?")
          .run("pendingAdminMfa");
        await db.prepare("DELETE FROM sessions").run();
      });
      res.clearCookie("credence_session", cookieOptions);
      ok(res, { enabled: true });
    },
  );
  router.post(
    "/mfa/disable",
    requireAdmin,
    limiter(5, 900000, "mfa-disable"),
    async (req, res) => {
      const input = passwordInput
        .extend({ code: z.string().regex(/^\d{6}$/) })
        .parse(req.body);
      await db.transaction(async () => {
        await lock();
        await confirm(input.currentPassword);
        if (!(await mfa.enabled()))
          throw Object.assign(
            new Error("Two-factor authentication is not enabled."),
            { status: 409 },
          );
        await mfa.verify(input.code);
        await db
          .prepare("DELETE FROM settings WHERE key IN (?,?)")
          .run("adminMfa", "pendingAdminMfa");
        await db.prepare("DELETE FROM sessions").run();
      });
      res.clearCookie("credence_session", cookieOptions);
      ok(res, { enabled: false });
    },
  );
  return router;
}
