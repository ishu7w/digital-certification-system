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
