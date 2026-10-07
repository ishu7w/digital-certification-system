export async function checkHealth(origin, fetcher = fetch) {
  const url = new URL("/api/health", origin);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("Health target must use HTTPS.");
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(`Health endpoint returned HTTP ${response.status}.`);
  const body = await response.json();
  if (!body.success || body.data?.status !== "ok")
    throw new Error("Database health check did not succeed.");
  if (!body.data.backup?.configured || !body.data.backup?.healthy)
    throw new Error(
      "The last verified offsite backup is missing or older than 36 hours.",
    );
  return body.data;
}
if (process.argv[1]?.endsWith("/health-check.js")) {
  const origin =
    process.env.PUBLIC_ORIGIN ||
    "https://digital-certification-system-mu.vercel.app";
  let failure;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await checkHealth(origin);
      console.log("Application, database, and backup freshness checks passed.");
      failure = null;
      break;
    } catch (error) {
      failure = error;
      if (attempt < 2)
        await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
  if (failure) {
    console.error(failure.message);
    process.exitCode = 1;
  }
}
