import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { get } from "@vercel/blob";
import pg from "pg";
import { postgresDatabase } from "../../server/storage.js";
import { restoreBackup } from "../../server/backup.js";
const schema = `credence_rehearsal_${randomBytes(8).toString("hex")}`;
const connection =
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (
  !connection ||
  !process.env.SIGNING_SECRET ||
  !process.env.BLOB_READ_WRITE_TOKEN
)
  throw new Error(
    "Production database, signing key and authenticated Blob download credentials are required.",
  );
const url = new URL(connection);
url.searchParams.set("sslmode", "verify-full");
const control = new pg.Client({ connectionString: url.toString() });
const target = postgresDatabase(url.toString(), { schema });
let connected = false,
  created = false;
try {
  await control.connect();
  connected = true;
  const result = await control.query(
    "SELECT value FROM settings WHERE key = $1",
    ["offsiteBackup"],
  );
  if (!result.rows[0])
    throw new Error("No verified offsite backup is recorded.");
  const status = JSON.parse(result.rows[0].value);
  if (!status.pathname.startsWith("credence-backups/"))
    throw new Error("Unexpected backup path.");
  const blob = await get(status.pathname, {
    access: "private",
    useCache: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (blob?.statusCode !== 200 || !blob.stream)
    throw new Error("Unable to download the private backup.");
  const bytes = Buffer.from(await new Response(blob.stream).arrayBuffer());
  const key = (await readFile(".backup-encryption-key", "utf8")).trim();
  await control.query(`CREATE SCHEMA ${schema}`);
  created = true;
  await target.migrate();
  const restored = await restoreBackup(
    target,
    process.env.SIGNING_SECRET,
    key,
    bytes,
  );
  if (restored.certificates !== status.certificates)
    throw new Error("Restored certificate count does not match.");
  const credentials = await target
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get("adminCredentials");
  if (!credentials)
    throw new Error("Administrator credentials were not restored.");
  const unauthenticated = await fetch(blob.blob.url, { redirect: "error" });
  if (unauthenticated.ok) throw new Error("Backup is publicly accessible.");
  await mkdir("backups", { recursive: true });
  await writeFile(
    `backups/offsite-restored-${new Date().toISOString().replaceAll(":", "-")}.enc`,
    bytes,
    {
      mode: 0o600,
      flag: "wx",
    },
  );
  console.log(
    `Downloaded private offsite backup, restored ${restored.certificates} certificates and administrator settings in an isolated schema, and verified public access is denied.`,
  );
} catch (error) {
  console.error("Backup rehearsal failed:", error.code || error.name);
  process.exitCode = 1;
} finally {
  await target.close();
  if (connected) {
    if (created) await control.query(`DROP SCHEMA ${schema} CASCADE`);
    await control.end();
  }
}
