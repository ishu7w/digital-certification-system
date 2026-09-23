import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { openDatabase } from "../server/db.js";
import { createApp } from "../server/app.js";
const db = openDatabase(":memory:");
let server, base, cookie, id;
const password = randomBytes(24).toString("hex");
before(async () => {
  const app = createApp({
    db,
    secret: randomBytes(32).toString("hex"),
    adminEmail: "admin@example.com",
    passwordHash: await bcrypt.hash(password, 12),
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => {
  server.close();
  db.close();
});
async function request(
  path,
  method = "GET",
  data,
  authenticated = false,
  headers = {},
) {
  return fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: data ? JSON.stringify(data) : undefined,
  });
}
const valid = {
  recipient: "Test Recipient",
  email: "private@example.com",
  course: "Certificate lifecycle testing",
  category: "Achievement",
  issuedAt: "2026-01-01",
  expiresAt: "",
};
test("sample workspace is readable and writes require administrator access", async () => {
  const response = await request("/certificates");
  const json = await response.json();
  assert.equal(json.data.length, 12);
  assert.equal((await request("/certificates", "POST", valid)).status, 401);
});
test("rejects wrong credentials; creates HTTP-only session for correct credentials", async () => {
  assert.equal(
    (
      await request("/login", "POST", {
        email: "admin@example.com",
        password: "incorrect",
      })
    ).status,
    401,
  );
  const response = await request("/login", "POST", {
    email: "admin@example.com",
    password,
  });
  assert.equal(response.status, 200);
  const raw = response.headers.get("set-cookie");
  assert.match(raw, /HttpOnly/);
  assert.match(raw, /SameSite=Strict/);
  cookie = raw.split(";")[0];
});
test("validates dates, required fields and cross-origin mutation requests", async () => {
  assert.equal(
    (
      await request(
        "/certificates",
        "POST",
        { ...valid, issuedAt: "2026-02-30" },
        true,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/certificates",
        "POST",
        { ...valid, expiresAt: "2025-12-31" },
        true,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request("/certificates", "POST", { ...valid, email: "bad" }, true))
      .status,
    400,
  );
  assert.equal(
    (
      await request("/certificates", "POST", valid, true, {
        Origin: "https://untrusted.example",
      })
    ).status,
    403,
  );
});
test("issues a certificate and keeps private records out of anonymous registry and activity", async () => {
  const response = await request("/certificates", "POST", valid, true);
  assert.equal(response.status, 201);
  const c = (await response.json()).data;
  id = c.id;
  assert.equal(c.status, "Active");
  const records = (await (await request("/certificates")).json()).data;
  assert.ok(!records.some((c) => c.id === id));
  const events = (await (await request("/activity")).json()).data;
  assert.ok(!events.some((c) => c.certificateId === id));
});
test("public verification returns current integrity state without email or signature", async () => {
  const response = await request(`/verify/${id}`);
  assert.equal(response.status, 200);
  const c = (await response.json()).data;
  assert.equal(c.status, "Active");
  assert.equal(c.email, undefined);
  assert.equal(c.signature, undefined);
  assert.equal((await request("/verify/CRD-2026-FFFFAAAA")).status, 404);
});
test("detects out-of-band tampering", async () => {
  db.prepare("UPDATE certificates SET course = ? WHERE id = ?").run(
    "Altered course",
    id,
  );
  assert.equal(
    (await (await request(`/verify/${id}`)).json()).data.status,
    "Invalid",
  );
  db.prepare("UPDATE certificates SET course = ? WHERE id = ?").run(
    valid.course,
    id,
  );
});
test("revocation is permanent, audited, and reflected publicly", async () => {
  assert.equal(
    (
      await request(`/certificates/${id}/revoke`, "POST", {
        reason: "Issued in error",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(
        `/certificates/${id}/revoke`,
        "POST",
        { reason: "Issued in error" },
        true,
      )
    ).status,
    200,
  );
  const c = (await (await request(`/verify/${id}`)).json()).data;
  assert.equal(c.status, "Revoked");
  assert.equal(c.reason, "Issued in error");
  assert.equal(
    (
      await request(
        `/certificates/${id}/revoke`,
        "POST",
        { reason: "Repeat revocation" },
        true,
      )
    ).status,
    409,
  );
  const events = (
    await (await request("/activity", "GET", undefined, true)).json()
  ).data;
  assert.ok(
    events.some((e) => e.certificateId === id && e.action === "Revoked"),
  );
});
test("expiration is derived from current date; logout invalidates the session", async () => {
  const response = await request(
    "/certificates",
    "POST",
    { ...valid, expiresAt: "2026-01-02" },
    true,
  );
  assert.equal((await response.json()).data.status, "Expired");
  assert.equal((await request("/logout", "POST", undefined, true)).status, 200);
  assert.equal(
    (await request("/certificates", "POST", valid, true)).status,
    401,
  );
});
test("production-style private workspace denies anonymous reads while allowing public verification", async () => {
  const privateDb = openDatabase(":memory:");
  const app = createApp({
    db: privateDb,
    secret: randomBytes(32).toString("hex"),
    demoMode: false,
  });
  const privateServer = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => privateServer.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${privateServer.address().port}/api`;
    assert.equal((await fetch(url + "/certificates")).status, 401);
    assert.equal((await fetch(url + "/activity")).status, 401);
    assert.equal((await fetch(url + "/verify/CRD-2026-1001")).status, 404);
  } finally {
    privateServer.close();
    privateDb.close();
  }
});
