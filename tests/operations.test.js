import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { openDatabase } from "../server/db.js";
import { asyncDatabase } from "../server/storage.js";
import { createApp } from "../server/app.js";
import { createCertificateService } from "../server/certificates.js";
import { offsiteBackup } from "../server/offsite-backup.js";
import { checkHealth } from "../scripts/ops/health-check.js";
function fakeStore(corrupt = false) {
  let bytes;
  const deleted = [];
  return {
    deleted,
    put: async (pathname, input, options) => {
      assert.equal(options.access, "private");
      assert.equal(options.allowOverwrite, false);
      bytes = input;
      return { pathname };
    },
    get: async (pathname, options) => {
      assert.equal(options.access, "private");
      return {
        statusCode: 200,
        stream: new Response(corrupt ? "corrupted" : bytes).body,
      };
    },
    list: async () => ({
      hasMore: false,
      blobs: [
        {
          pathname: "credence-backups/old.enc",
          url: "https://store.private.blob.vercel-storage.com/old",
          uploadedAt: new Date("2026-01-01"),
        },
        {
          pathname: "unrelated/data",
          url: "https://store.private.blob.vercel-storage.com/unrelated",
          uploadedAt: new Date("2026-01-01"),
        },
      ],
    }),
    del: async (urls) => deleted.push(...urls),
  };
}
test("offsite backup verifies private uploads before retention cleanup and records success", async () => {
  const raw = openDatabase(":memory:"),
    db = asyncDatabase(raw),
    secret = randomBytes(32).toString("hex"),
    encryptionKey = randomBytes(32).toString("hex");
  try {
    await createCertificateService(db, secret).issue({
      recipient: "Backup Test",
      email: "private@example.com",
      course: "Encrypted Storage",
      category: "Achievement",
      issuedAt: "2026-01-01",
    });
    const store = fakeStore();
    const status = await offsiteBackup({
      db,
      secret,
      encryptionKey,
      store,
      now: new Date("2026-10-07T12:00:00Z"),
    });
    assert.equal(status.certificates, 1);
    assert.equal(store.deleted.length, 1);
    assert.match(store.deleted[0], /\/old$/);
    const prior = (
      await db
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("offsiteBackup")
    ).value;
    const bad = fakeStore(true);
    await assert.rejects(
      offsiteBackup({ db, secret, encryptionKey, store: bad }),
      /checksum/,
    );
    assert.equal(bad.deleted.length, 0);
    assert.equal(
      (
        await db
          .prepare("SELECT value FROM settings WHERE key = ?")
          .get("offsiteBackup")
      ).value,
      prior,
    );
  } finally {
    raw.close();
  }
});
test("backup job requires its own token and health reports verified backup freshness", async () => {
  const raw = openDatabase(":memory:"),
    db = asyncDatabase(raw),
    jobToken = randomBytes(32).toString("hex");
  const server = createApp({
    db,
    secret: randomBytes(32).toString("hex"),
    demoMode: false,
    backup: {
      jobToken,
      encryptionKey: randomBytes(32).toString("hex"),
      storeId: "private-test",
      store: fakeStore(),
    },
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(
      (await fetch(base + "/api/ops/backup", { method: "POST" })).status,
      401,
    );
    assert.equal(
      (
        await fetch(base + "/api/ops/backup", {
          method: "POST",
          headers: { Authorization: "Bearer wrong" },
        })
      ).status,
      401,
    );
    let health = (await (await fetch(base + "/api/health")).json()).data;
    assert.equal(health.backup.configured, true);
    assert.equal(health.backup.healthy, false);
    assert.equal(
      (
        await fetch(base + "/api/ops/backup", {
          method: "POST",
          headers: { Authorization: `Bearer ${jobToken}` },
        })
      ).status,
      200,
    );
    health = await checkHealth(base);
    assert.equal(health.backup.healthy, true);
    await db
      .prepare("UPDATE settings SET value = ? WHERE key = ?")
      .run(
        JSON.stringify({
          lastSuccessAt: new Date(Date.now() - 40 * 3600000).toISOString(),
        }),
        "offsiteBackup",
      );
    await assert.rejects(checkHealth(base), /older than 36 hours/);
    await assert.rejects(
      checkHealth(
        "https://example.com",
        async () => new Response("{}", { status: 503 }),
      ),
      /HTTP 503/,
    );
  } finally {
    await new Promise((r) => server.close(r));
    raw.close();
  }
});
