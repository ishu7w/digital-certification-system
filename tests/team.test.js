import assert from "node:assert/strict";
import { asyncDatabase } from "../server/storage.js";
import { createBackup, restoreBackup } from "../server/backup.js";
import { test } from "node:test";
import { openDatabase } from "../server/db.js";
import { teamWorkflow } from "./helpers/team-workflow.js";
test("Staff permissions, one-time invitations, concurrent reviews and linked corrections", async () => {
  const db = openDatabase(":memory:");
  try {
    const { secret } = await teamWorkflow(db);
    const backup = await createBackup(
      asyncDatabase(db),
      secret,
      "b".repeat(32),
    );
    const target = openDatabase(":memory:");
    try {
      await restoreBackup(
        asyncDatabase(target),
        secret,
        "b".repeat(32),
        backup,
      );
      assert.equal(
        target.prepare("SELECT COUNT(*) AS count FROM staff").get().count,
        2,
      );
      assert.equal(
        target.prepare("SELECT active FROM staff WHERE role = ?").get("issuer")
          .active,
        0,
      );
      assert.equal(
        target
          .prepare("SELECT COUNT(*) AS count FROM requests WHERE state = ?")
          .get("approved").count,
        2,
      );
      assert.ok(
        target.prepare("SELECT COUNT(*) AS count FROM audit").get().count > 0,
      );
      assert.equal(
        target.prepare("SELECT COUNT(*) AS count FROM sessions").get().count,
        0,
      );
    } finally {
      target.close();
    }
  } finally {
    db.close();
  }
});
