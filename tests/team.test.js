import { test } from "node:test";
import { openDatabase } from "../server/db.js";
import { teamWorkflow } from "./helpers/team-workflow.js";
test("Staff permissions, one-time invitations, concurrent reviews and linked corrections", async () => {
  const db = openDatabase(":memory:");
  try {
    await teamWorkflow(db);
  } finally {
    db.close();
  }
});
