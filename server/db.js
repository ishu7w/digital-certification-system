import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

export function openDatabase(path = "data/credence.sqlite") {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS certificates (
      id TEXT PRIMARY KEY, recipient TEXT NOT NULL, email TEXT NOT NULL,
      course TEXT NOT NULL, category TEXT NOT NULL, issuedAt TEXT NOT NULL,
      expiresAt TEXT, createdAt TEXT NOT NULL, revokedAt TEXT, reason TEXT,
      signature TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS certificates_created ON certificates(createdAt DESC);
    CREATE INDEX IF NOT EXISTS certificates_email ON certificates(email);
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT, certificateId TEXT NOT NULL REFERENCES certificates(id),
      action TEXT NOT NULL, detail TEXT NOT NULL, createdAt TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS activity_certificate ON activity(certificateId);
    CREATE TABLE IF NOT EXISTS sessions (tokenHash TEXT PRIMARY KEY, expiresAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  return db;
}
export function localSecret(db) {
  const saved = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get("signingSecret");
  if (saved) return saved.value;
  const secret = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO settings VALUES (?, ?)").run("signingSecret", secret);
  return secret;
}
