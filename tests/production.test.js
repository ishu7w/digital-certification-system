import { test } from "node:test";
import { openDatabase } from "../server/db.js";
import { asyncDatabase } from "../server/storage.js";
import { productionWorkflow } from "./helpers/production-workflow.js";

test("production workflow: issuer snapshots, atomic idempotent batches, PDFs, recovery and encrypted restore", async () => {
  const raw = openDatabase(":memory:"),
    other = openDatabase(":memory:");
  try {
    await productionWorkflow(raw, asyncDatabase(other));
  } finally {
    raw.close();
    other.close();
  }
});
