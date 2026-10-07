const origin =
  process.env.PUBLIC_ORIGIN ||
  "https://digital-certification-system-mu.vercel.app";
if (!process.env.BACKUP_JOB_TOKEN)
  throw new Error("Backup job token is required.");
const response = await fetch(new URL("/api/ops/backup", origin), {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.BACKUP_JOB_TOKEN}` },
  signal: AbortSignal.timeout(90000),
  redirect: "error",
});
if (!response.ok)
  throw new Error(
    `Offsite backup failed with HTTP ${response.status}. Check Vercel request logs.`,
  );
const body = await response.json();
if (!body.success || !body.data?.lastSuccessAt)
  throw new Error("Backup service did not confirm a verified upload.");
console.log(
  `Verified encrypted backup saved at ${body.data.lastSuccessAt} (${body.data.bytes} bytes).`,
);
