import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { openDatabase } from "../server/db.js";
import { createApp } from "../server/app.js";
import { base32, totp, validStep } from "../server/mfa.js";
test("TOTP matches RFC 6238 SHA1 vectors and rejects replay", () => {
  const secret = base32(Buffer.from("12345678901234567890"));
  for (const [time, expected] of [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])
    assert.equal(totp(secret, Math.floor(time / 30), 8), expected);
  const now = 1234567890000,
    step = Math.floor(now / 30000),
    code = totp(secret, step);
  assert.equal(validStep(secret, code, -1, now), step);
  assert.equal(validStep(secret, code, step, now), null);
});
test("MFA enrollment, login, backup settings and recovery enforce account security", async () => {
  const db = openDatabase(":memory:"),
    password = randomBytes(24).toString("hex");
  const app = createApp({
    db,
    secret: randomBytes(32).toString("hex"),
    adminEmail: "owner@example.com",
    passwordHash: await bcrypt.hash(password, 12),
    demoMode: false,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = "";
  const req = async (path, data, auth = true) =>
    fetch(base + path, {
      method: data ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Cookie: cookie } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  try {
    let response = await req(
      "/login",
      { email: "owner@example.com", password },
      false,
    );
    cookie = response.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (await req("/mfa/enroll", { currentPassword: "incorrect" })).status,
      401,
    );
    const codes = (
      await (await req("/recovery-codes", { currentPassword: password })).json()
    ).data.codes;
    const enrollment = (
      await (await req("/mfa/enroll", { currentPassword: password })).json()
    ).data;
    const saved = db
      .prepare("SELECT value FROM settings WHERE key=?")
      .get("pendingAdminMfa").value;
    assert.equal(saved.includes(enrollment.secret), false);
    const step = Math.floor(Date.now() / 30000),
      code = totp(enrollment.secret, step);
    assert.equal(
      (await req("/mfa/confirm", { currentPassword: password, code })).status,
      200,
    );
    assert.equal((await req("/mfa")).status, 401);
    assert.equal(
      (await req("/login", { email: "owner@example.com", password }, false))
        .status,
      401,
    );
    assert.equal(
      (
        await req(
          "/login",
          { email: "owner@example.com", password, code },
          false,
        )
      ).status,
      401,
    );
    response = await req(
      "/login",
      {
        email: "owner@example.com",
        password,
        code: totp(enrollment.secret, step + 1),
      },
      false,
    );
    assert.equal(response.status, 200);
    cookie = response.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (await req("/mfa/disable", { currentPassword: password, code })).status,
      401,
    );
    assert.equal(
      (
        await req(
          "/recover",
          {
            email: "owner@example.com",
            code: codes[0],
            newPassword: password + "x",
          },
          false,
        )
      ).status,
      200,
    );
    assert.equal(
      db.prepare("SELECT value FROM settings WHERE key=?").get("adminMfa"),
      undefined,
    );
    assert.equal(
      (
        await req(
          "/recover",
          {
            email: "owner@example.com",
            code: codes[0],
            newPassword: password + "x",
          },
          false,
        )
      ).status,
      401,
    );
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
  }
});

test("Legacy owner sessions remain compatible with the additive staff migration", async () => {
  const { createHash } = await import("node:crypto");
  const db = openDatabase(":memory:"),
    token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions VALUES (?,?)").run(
    createHash("sha256").update(token).digest("hex"),
    Date.now() + 60000,
  );
  const server = createApp({
    db,
    secret: randomBytes(32).toString("hex"),
    demoMode: false,
    adminEmail: "owner@example.com",
    passwordHash: await bcrypt.hash(randomBytes(20).toString("hex"), 12),
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/session`,
      { headers: { Cookie: `credence_session=${token}` } },
    );
    assert.equal((await response.json()).data.role, "admin");
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
  }
});
