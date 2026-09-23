import { resolve } from "node:path";
import express from "express";
import { openDatabase, localSecret } from "./db.js";
import { createApp } from "./app.js";
const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be a valid port number");
if (
  production &&
  (!process.env.SIGNING_SECRET ||
    process.env.SIGNING_SECRET.length < 32 ||
    !process.env.ADMIN_EMAIL ||
    !process.env.ADMIN_PASSWORD_HASH)
)
  throw new Error(
    "Production requires SIGNING_SECRET (32+ characters), ADMIN_EMAIL and ADMIN_PASSWORD_HASH",
  );
if (process.env.SIGNING_SECRET && process.env.SIGNING_SECRET.length < 32)
  throw new Error("SIGNING_SECRET must have at least 32 characters");
if (
  process.env.ADMIN_PASSWORD_HASH &&
  !/^\$2[aby]\$(1[2-9]|2\d|3[01])\$/.test(process.env.ADMIN_PASSWORD_HASH)
)
  throw new Error("Use a bcrypt password hash with cost 12 or higher");
const db = openDatabase(process.env.DB_PATH || "data/credence.sqlite");
const app = createApp({
  db,
  secret: process.env.SIGNING_SECRET || localSecret(db),
  adminEmail: process.env.ADMIN_EMAIL,
  passwordHash: process.env.ADMIN_PASSWORD_HASH,
  demoMode: process.env.DEMO_MODE !== "false",
  production,
});
if (production) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (req, res) => res.sendFile(resolve("dist/index.html")));
}
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`Credence API listening at http://127.0.0.1:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
