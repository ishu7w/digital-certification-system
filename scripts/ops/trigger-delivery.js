const token = process.env.EMAIL_JOB_TOKEN;
if (!token || token.length < 32)
  throw new Error("A restricted email job token is required.");
const response = await fetch(
  "https://digital-certification-system-mu.vercel.app/api/ops/delivery",
  {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(45000),
  },
);
if (!response.ok)
  throw new Error(`Email worker failed with HTTP ${response.status}.`);
const result = await response.json();
if (!result.success) throw new Error("Email worker did not confirm success.");
console.log(`Email worker processed ${result.data.processed} queued delivery.`);
