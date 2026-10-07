import express from "express";
import { randomBytes } from "node:crypto";
import { openDatabase } from "../server/db.js";
import { postgresDatabase } from "../server/storage.js";
import { productionConfig } from "../server/config.js";
import { createApp } from "../server/app.js";

// PostgreSQL enables the private full system. Without it, only disposable
// sample data is available and mutations remain blocked.
const hosted = Boolean(process.env.DATABASE_URL);
const db = hosted
  ? postgresDatabase(process.env.DATABASE_URL)
  : openDatabase(":memory:");
const app = express();
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!hosted && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return res.status(403).json({
      success: false,
      error:
        "This is a read-only demo. Issuing and revoking certificates is disabled.",
      code: 403,
    });
  }
  next();
});
app.use(
  createApp({
    ...(hosted
      ? productionConfig()
      : {
          secret: randomBytes(32).toString("hex"),
          demoMode: true,
          production: true,
        }),
    db,
    trustProxy: 1,
  }),
);
export default app;
