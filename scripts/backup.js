import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import { postgresDatabase } from "../server/storage.js";
import { asyncDatabase } from "../server/storage.js";
import { openDatabase } from "../server/db.js";
import { createBackup, restoreBackup } from "../server/backup.js";
const [mode, file, keyFile] = process.argv.slice(2);
if (
  !["create", "restore"].includes(mode) ||
  !file ||
  !keyFile ||
  !process.env.SIGNING_SECRET
)
  throw new Error(
    "Usage: node --env-file=.env.production.local scripts/backup.js create|restore FILE KEY_FILE. SIGNING_SECRET is required.",
  );
const encryptionKey = (await readFile(keyFile, "utf8")).trim();
const db = process.env.DATABASE_URL
  ? postgresDatabase(process.env.DATABASE_URL)
  : asyncDatabase(
      openDatabase(process.env.DATABASE_PATH || "data/credence.sqlite"),
    );
try {
  if (mode === "create") {
    const bytes = await createBackup(
      db,
      process.env.SIGNING_SECRET,
      encryptionKey,
    );
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes, { mode: 0o600, flag: "wx" });
    await chmod(file, 0o600);
    console.log(
      "Encrypted backup saved. Keep its encryption key and the signing key separately.",
    );
  } else {
    if (db.migrate) await db.migrate();
    const result = await restoreBackup(
      db,
      process.env.SIGNING_SECRET,
      encryptionKey,
      await readFile(file),
    );
    console.log(
      `Restored ${result.certificates} certificates into the empty target.`,
    );
  }
} finally {
  await db.close();
}
