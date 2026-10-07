import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Webhook } from "svix";
import { openDatabase } from "../server/db.js";
import { asyncDatabase } from "../server/storage.js";
import { createCertificateService } from "../server/certificates.js";
import { deliveryService } from "../server/delivery.js";
import { createApp } from "../server/app.js";
import { createBackup, restoreBackup } from "../server/backup.js";
const input = {
  recipient: "Delivery Recipient",
  email: "recipient@example.com",
  course: "Delivery Course",
  category: "Achievement",
  issuedAt: "2026-01-01",
  expiresAt: null,
};
test("Durable delivery preserves payload and idempotency across retries, rejects stale jobs and restores held", async () => {
  const raw = openDatabase(":memory:"),
    db = asyncDatabase(raw),
    secret = randomBytes(32).toString("hex"),
    service = createCertificateService(db, secret),
    calls = [];
  const config = {
    apiKey: "test-not-a-real-key",
    from: "issuer@example.com",
    webhookSecret: "whsec_" + randomBytes(32).toString("base64"),
  };
  let failing = true;
  const delivery = deliveryService({
    db,
    service,
    config,
    origin: "https://example.com",
    lock: async () => {},
    send: async (url, options) => {
      calls.push(options);
      return failing
        ? new Response("{}", { status: 503 })
        : Response.json({ id: "provider-test-id" });
    },
  });
  const target = openDatabase(":memory:");
  try {
    const c = await service.issue(input),
      job = await delivery.queue(c.id);
    assert.deepEqual(await delivery.queue(c.id), job);
    assert.equal((await delivery.process()).state, "retry");
    assert.equal((await delivery.process()).processed, 0);
    await db.prepare("UPDATE deliveries SET due = ?").run(0);
    failing = false;
    assert.equal((await delivery.process()).state, "sent");
    assert.equal(calls[0].body, calls[1].body);
    assert.equal(
      calls[0].headers["Idempotency-Key"],
      calls[1].headers["Idempotency-Key"],
    );
    assert.equal(
      JSON.parse(calls[0].body).attachments[0].filename,
      c.id + ".pdf",
    );
    const stale = await delivery.queue(
      (await service.issue({ ...input, recipient: "Stale Recipient" })).id,
    );
    await db
      .prepare("UPDATE deliveries SET created = ? WHERE id = ?")
      .run(new Date(Date.now() - 25 * 3600000).toISOString(), stale.id);
    assert.equal((await delivery.process()).state, "held");
    assert.equal(calls.length, 2);
    const pending = await delivery.queue(
      (await service.issue({ ...input, recipient: "Pending Recipient" })).id,
    );
    const bytes = await createBackup(db, secret, "x".repeat(32));
    await restoreBackup(asyncDatabase(target), secret, "x".repeat(32), bytes);
    assert.equal(
      target
        .prepare("SELECT state FROM deliveries WHERE id = ?")
        .get(pending.id).state,
      "held",
    );
  } finally {
    target.close();
    raw.close();
  }
});
test("Signed delivery callbacks are authenticated, deduplicated and cannot override bounce with delivered", async () => {
  const db = openDatabase(":memory:"),
    secret = randomBytes(32).toString("hex"),
    webhookSecret = "whsec_" + randomBytes(32).toString("base64");
  const service = createCertificateService(db, secret);
  const c = await service.issue(input);
  db.prepare(
    "INSERT INTO deliveries (id,certificate,payload,state,provider,due,created) VALUES (?,?,?,?,?,?,?)",
  ).run(
    "test-job",
    c.id,
    "{}",
    "sent",
    "provider-test",
    0,
    new Date().toISOString(),
  );
  const server = createApp({
    db,
    secret,
    demoMode: false,
    email: { webhookSecret },
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${server.address().port}/api/email/webhook`,
    signer = new Webhook(webhookSecret);
  const callback = async (id, type, valid = true) => {
    const time = new Date(),
      body = JSON.stringify({
        type,
        created_at: time.toISOString(),
        data: { email_id: "provider-test" },
      });
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "svix-id": id,
        "svix-timestamp": String(Math.floor(time.getTime() / 1000)),
        "svix-signature": valid ? signer.sign(id, time, body) : "v1,invalid",
      },
      body,
    });
  };
  try {
    assert.equal(
      (await callback("event-0", "email.delivered", false)).status,
      401,
    );
    assert.equal((await callback("event-1", "email.bounced")).status, 200);
    assert.equal((await callback("event-1", "email.bounced")).status, 200);
    assert.equal((await callback("event-2", "email.delivered")).status, 200);
    assert.equal(
      db.prepare("SELECT state FROM deliveries").get().state,
      "bounced",
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS total FROM delivery_events").get().total,
      2,
    );
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
  }
});
