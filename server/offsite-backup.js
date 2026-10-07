import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { put, get, list, del } from "@vercel/blob";
import { createBackup, decryptBackup } from "./backup.js";
import { createCertificateService } from "./certificates.js";
export const backupPrefix = "credence-backups/";
export const defaultBackupStore = { put, get, list, del };
const sha = (value) => createHash("sha256").update(value).digest();
export async function offsiteBackup({
  db,
  secret,
  encryptionKey,
  store = defaultBackupStore,
  now = new Date(),
}) {
  const bytes = await createBackup(db, secret, encryptionKey);
  if (bytes.length > 10 * 1024 * 1024)
    throw new Error("Backup exceeds the configured 10 MB storage budget.");
  const payload = decryptBackup(secret, encryptionKey, bytes);
  const service = createCertificateService(db, secret);
  for (const record of payload.data.certificates)
    if (service.present(record).status === "Invalid")
      throw new Error("Backup contains an invalid certificate.");
  const pathname = `${backupPrefix}${now.toISOString().replaceAll(":", "-")}-${randomBytes(6).toString("hex")}.enc`;
  const blob = await store.put(pathname, bytes, {
    access: "private",
    contentType: "application/octet-stream",
    addRandomSuffix: false,
    allowOverwrite: false,
  });
  const stored = await store.get(blob.pathname, {
    access: "private",
    useCache: false,
  });
  if (stored?.statusCode !== 200 || !stored.stream)
    throw new Error("Backup upload could not be read back.");
  const returned = Buffer.from(await new Response(stored.stream).arrayBuffer());
  if (!timingSafeEqual(sha(bytes), sha(returned)))
    throw new Error("Backup upload checksum does not match.");
  decryptBackup(secret, encryptionKey, returned);
  const status = {
    lastSuccessAt: now.toISOString(),
    pathname: blob.pathname,
    bytes: bytes.length,
    certificates: payload.data.certificates.length,
  };
  await db
    .prepare(
      "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    )
    .run("offsiteBackup", JSON.stringify(status));
  // Prune only after a verified new backup exists; unrelated files are untouched.
  const cutoff = now.getTime() - 30 * 86400000;
  let cursor,
    hasMore = true;
  while (hasMore) {
    const page = await store.list({
      prefix: backupPrefix,
      cursor,
      limit: 1000,
    });
    const expired = page.blobs
      .filter(
        (item) =>
          item.pathname.startsWith(backupPrefix) &&
          item.pathname !== blob.pathname &&
          new Date(item.uploadedAt).getTime() < cutoff,
      )
      .map((item) => item.url);
    if (expired.length) await store.del(expired);
    cursor = page.cursor;
    hasMore = page.hasMore;
  }
  return status;
}
export function backupRoutes({ db, secret, backup, ok, fail }) {
  const router = Router();
  router.post("/ops/backup", async (req, res) => {
    if (!backup?.jobToken || !backup.encryptionKey || !backup.storeId)
      return fail(res, "Offsite backups are not configured.", 503);
    const provided = req.headers.authorization || "";
    if (!timingSafeEqual(sha(provided), sha(`Bearer ${backup.jobToken}`)))
      return fail(res, "Unauthorized", 401);
    const status = await offsiteBackup({
      db,
      secret,
      encryptionKey: backup.encryptionKey,
      store: backup.store || defaultBackupStore,
    });
    ok(res, status);
  });
  return router;
}
