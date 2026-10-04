import express from "express";
import { randomBytes } from "node:crypto";
import { openDatabase } from "../server/db.js";
import { createApp } from "../server/app.js";

// The hosted demo contains only seeded samples. Never open the local database
// or enable administrator credentials in this disposable serverless runtime.
const db = openDatabase(":memory:");
const app = express();
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
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
    db,
    secret: randomBytes(32).toString("hex"),
    demoMode: true,
    production: true,
  }),
);
export default app;
