import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { openDatabase } from "../server/db.js";
import { createApp } from "../server/app.js";
import { createCertificateService } from "../server/certificates.js";

test("setup is token-protected, single use, and login survives a new app instance", async () => {
  const db = openDatabase(":memory:");
  const secret = randomBytes(32).toString("hex");
  const token = randomBytes(32).toString("hex");
  const options = {
    db,
    secret,
    demoMode: false,
    setupToken: token,
    setupExpiresAt: Date.now() + 60000,
  };
  const server = createApp(options).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = (path, body) =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const account = {
      token,
      email: "owner@example.com",
      password: randomBytes(24).toString("hex"),
    };
    assert.equal(
      (await post("/setup", { ...account, token: "wrong" })).status,
      403,
    );
    assert.equal(
      (await post("/setup", { ...account, password: "short" })).status,
      400,
    );
    assert.equal((await post("/setup", account)).status, 201);
    assert.equal((await post("/setup", account)).status, 409);
    const login = await post("/login", {
      email: account.email,
      password: account.password,
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const second = createApp(options).listen(0, "127.0.0.1");
    await new Promise((resolve) => second.once("listening", resolve));
    try {
      const response = await fetch(
        `http://127.0.0.1:${second.address().port}/api/session`,
        { headers: { Cookie: cookie } },
      );
      assert.equal((await response.json()).data.role, "admin");
    } finally {
      await new Promise((resolve) => second.close(resolve));
    }
    const newPassword = randomBytes(24).toString("hex");
    const change = await fetch(base + "/password", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ currentPassword: account.password, newPassword }),
    });
    assert.equal(change.status, 200);
    assert.equal(
      (
        await (
          await fetch(base + "/session", { headers: { Cookie: cookie } })
        ).json()
      ).data.role,
      "viewer",
    );
    assert.equal(
      (
        await post("/login", {
          email: account.email,
          password: account.password,
        })
      ).status,
      401,
    );
    assert.equal(
      (await post("/login", { email: account.email, password: newPassword }))
        .status,
      200,
    );
    for (let i = 0; i < 10; i++)
      await post("/login", { email: account.email, password: "wrong" });
    const limited = await post("/login", {
      email: account.email,
      password: account.password,
    });
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get("retry-after"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});

test("revocation fields are integrity protected and concurrent revokes produce one event", async () => {
  const db = openDatabase(":memory:");
  const service = createCertificateService(db, randomBytes(32).toString("hex"));
  try {
    const c = await service.issue({
      recipient: "Test Recipient",
      email: "test@example.com",
      course: "Security testing",
      category: "Achievement",
      issuedAt: "2026-01-01",
    });
    const outcomes = await Promise.allSettled([
      service.revoke(c.id, "First revocation"),
      service.revoke(c.id, "Second revocation"),
    ]);
    assert.equal(
      outcomes.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      (await service.activity(false)).filter(
        (event) => event.action === "Revoked",
      ).length,
      1,
    );
    db.prepare(
      "UPDATE certificates SET revokedAt = NULL, reason = NULL WHERE id = ?",
    ).run(c.id);
    assert.equal((await service.verify(c.id)).status, "Invalid");
  } finally {
    db.close();
  }
});
