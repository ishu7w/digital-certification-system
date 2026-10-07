import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  createHash,
} from "node:crypto";
import { z } from "zod";
import { createCertificateService } from "./certificates.js";
const tables = ["certificates", "activity", "settings", "issuance_batches"];
const allowedSettings = new Set([
  "institution",
  "adminCredentials",
  "recoveryCodes",
]);
const key = (password, salt) => scryptSync(password, salt, 32);
export async function createBackup(db, signingSecret, password) {
  if (password.length < 32)
    throw new Error("Backup encryption key must have at least 32 characters.");
  const data = await db.transaction(async () => {
    // Establish a consistent snapshot before reading multiple tables.
    if (db.dialect === "postgres")
      await db.prepare("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ").run();
    const result = {};
    for (const table of tables)
      result[table] = await db.prepare(`SELECT * FROM ${table}`).all();
    result.settings = result.settings.filter((row) =>
      allowedSettings.has(row.key),
    );
    return result;
  });
  const payload = {
    version: 1,
    createdAt: new Date().toISOString(),
    signingFingerprint: createHash("sha256")
      .update(signingSecret)
      .digest("hex"),
    data,
  };
  const salt = randomBytes(16),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(password, salt), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return Buffer.from(
    JSON.stringify({
      format: "credence-encrypted-backup-v1",
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: encrypted.toString("base64"),
    }),
  );
}
export async function restoreBackup(db, signingSecret, password, bytes) {
  const envelope = z
    .object({
      format: z.literal("credence-encrypted-backup-v1"),
      salt: z.string(),
      iv: z.string(),
      tag: z.string(),
      data: z.string(),
    })
    .strict()
    .parse(JSON.parse(bytes.toString()));
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(password, Buffer.from(envelope.salt, "base64")),
    Buffer.from(envelope.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const payload = JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(envelope.data, "base64")),
      decipher.final(),
    ]).toString("utf8"),
  );
  if (
    payload.version !== 1 ||
    payload.signingFingerprint !==
      createHash("sha256").update(signingSecret).digest("hex")
  )
    throw new Error("Backup version or signing key does not match.");
  const fields = {
    certificates: [
      "id",
      "recipient",
      "email",
      "course",
      "category",
      "issuedAt",
      "expiresAt",
      "createdAt",
      "revokedAt",
      "reason",
      "signature",
      "demo",
      "signatureVersion",
      "issuer",
    ],
    activity: ["certificateId", "action", "detail", "createdAt", "demo"],
    settings: ["key", "value"],
    issuance_batches: ["key", "digest", "result", "createdAt"],
  };
  await db.transaction(async () => {
    // No overwrite path: recovery always targets a fresh database.
    for (const table of tables)
      if (await db.prepare(`SELECT 1 AS present FROM ${table} LIMIT 1`).get())
        throw new Error("Restore target must be empty.");
    for (const table of tables) {
      if (!Array.isArray(payload.data[table]))
        throw new Error("Invalid backup table.");
      for (const row of payload.data[table]) {
        if (table === "settings" && !allowedSettings.has(row.key))
          throw new Error("Invalid backup setting.");
        const columns = fields[table];
        await db
          .prepare(
            `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
          )
          .run(...columns.map((column) => row[column] ?? null));
      }
    }
    const service = createCertificateService(db, signingSecret);
    for (const row of payload.data.certificates)
      if (service.present(row).status === "Invalid")
        throw new Error("Backup contains an invalid certificate signature.");
  });
  return { certificates: payload.data.certificates.length };
}
