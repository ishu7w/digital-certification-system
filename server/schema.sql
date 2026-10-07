CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY, recipient TEXT NOT NULL, email TEXT NOT NULL,
  course TEXT NOT NULL, category TEXT NOT NULL, "issuedAt" TEXT NOT NULL,
  "expiresAt" TEXT, "createdAt" TEXT NOT NULL, "revokedAt" TEXT, reason TEXT,
  signature TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0,
  "signatureVersion" INTEGER NOT NULL DEFAULT 1,
  CHECK (demo IN (0, 1)), CHECK ("signatureVersion" IN (1, 2))
);
CREATE INDEX IF NOT EXISTS certificates_created ON certificates("createdAt" DESC);
CREATE INDEX IF NOT EXISTS certificates_email ON certificates(email);
CREATE TABLE IF NOT EXISTS activity (
  id SERIAL PRIMARY KEY, "certificateId" TEXT NOT NULL REFERENCES certificates(id),
  action TEXT NOT NULL, detail TEXT NOT NULL, "createdAt" TEXT NOT NULL,
  demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS activity_certificate ON activity("certificateId");
CREATE TABLE IF NOT EXISTS sessions (
  "tokenHash" TEXT PRIMARY KEY, "expiresAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions("expiresAt");
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY, hits INTEGER NOT NULL, "resetAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_expiry ON rate_limits("resetAt");
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

ALTER TABLE certificates ADD COLUMN IF NOT EXISTS issuer TEXT;
CREATE TABLE IF NOT EXISTS issuance_batches (
  key TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT NOT NULL, "createdAt" TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS session_principals ("tokenHash" TEXT PRIMARY KEY REFERENCES sessions("tokenHash") ON DELETE CASCADE, principal TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS session_principals_user ON session_principals(principal);
CREATE TABLE IF NOT EXISTS staff (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('issuer','reviewer')), password TEXT, active INTEGER NOT NULL DEFAULT 1, invitation TEXT, expiry BIGINT, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, payload TEXT NOT NULL, submitter TEXT NOT NULL, state TEXT NOT NULL, reviewer TEXT, note TEXT, certificate TEXT, replaces TEXT REFERENCES certificates(id), created TEXT NOT NULL, updated TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS requests_state ON requests(state);
CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, certificate TEXT UNIQUE NOT NULL REFERENCES certificates(id), payload TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, provider TEXT, error TEXT, due BIGINT NOT NULL, started BIGINT, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS delivery_events (id TEXT PRIMARY KEY, provider TEXT NOT NULL, type TEXT NOT NULL, created TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS deliveries_due ON deliveries(state,due);
CREATE INDEX IF NOT EXISTS requests_submitter ON requests(submitter,created DESC);
CREATE INDEX IF NOT EXISTS audit_created ON audit(created DESC);
CREATE INDEX IF NOT EXISTS deliveries_provider ON deliveries(provider);
CREATE INDEX IF NOT EXISTS delivery_events_provider ON delivery_events(provider);
