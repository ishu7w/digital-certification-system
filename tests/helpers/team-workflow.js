import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { createApp } from "../../server/app.js";
export async function teamWorkflow(db) {
  const password = randomBytes(20).toString("hex");
  const secret = randomBytes(32).toString("hex");
  const server = createApp({
    db,
    secret,
    adminEmail: "owner@example.com",
    passwordHash: await bcrypt.hash(password, 12),
    demoMode: false,
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, method = "GET", data, cookie) =>
    fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  const login = async (email) => {
    const res = await call("/login", "POST", { email, password });
    assert.equal(res.status, 200);
    return res.headers.get("set-cookie").split(";")[0];
  };
  try {
    const owner = await login("owner@example.com"),
      accounts = {};
    for (const role of ["issuer", "reviewer"]) {
      const email = `${role}@example.com`;
      const res = await call(
        "/staff",
        "POST",
        { email, name: `Test ${role}`, role },
        owner,
      );
      assert.equal(res.status, 201);
      const data = (await res.json()).data;
      const token = new URL(data.invitation).hash.split("=")[1];
      assert.equal(
        (await call("/staff/accept", "POST", { token, password })).status,
        200,
      );
      assert.equal(
        (await call("/staff/accept", "POST", { token, password })).status,
        403,
      );
      accounts[role] = { id: data.id, cookie: await login(email) };
    }
    const issuer = accounts.issuer.cookie,
      reviewer = accounts.reviewer.cookie;
    assert.equal((await call("/staff", "GET", null, issuer)).status, 403);
    assert.equal(
      (
        await call(
          "/institution",
          "PUT",
          { name: "Bad institution", signatory: "Bad signatory" },
          reviewer,
        )
      ).status,
      403,
    );
    const certificate = {
      recipient: "Test Recipient",
      email: "recipient@example.com",
      course: "Reviewed course",
      category: "Achievement",
      issuedAt: "2026-01-01",
      expiresAt: "",
    };
    assert.equal(
      (await call("/certificates", "POST", certificate, issuer)).status,
      403,
    );
    assert.equal(
      (await call("/certificates", "GET", null, issuer)).status,
      200,
    );
    assert.equal(
      (await call("/requests", "POST", { certificate }, reviewer)).status,
      403,
    );
    const request = (
      await (await call("/requests", "POST", { certificate }, issuer)).json()
    ).data;
    assert.equal(
      (
        await call(
          `/requests/${request.id}/review`,
          "POST",
          { decision: "approve", note: "Reviewed details." },
          issuer,
        )
      ).status,
      403,
    );
    const approvals = await Promise.all(
      [1, 2].map(() =>
        call(
          `/requests/${request.id}/review`,
          "POST",
          { decision: "approve", note: "Reviewed details." },
          reviewer,
        ),
      ),
    );
    assert.deepEqual(approvals.map((x) => x.status).sort(), [200, 409]);
    const approved = (
      await (await call("/requests", "GET", null, reviewer)).json()
    ).data[0];
    assert.equal(approved.state, "approved");
    const correction = (
      await (
        await call(
          "/requests",
          "POST",
          {
            certificate: { ...certificate, recipient: "Corrected Recipient" },
            replaces: approved.certificate,
            note: "Correct recipient spelling.",
          },
          issuer,
        )
      ).json()
    ).data;
    assert.equal(
      (
        await call(
          `/requests/${correction.id}/review`,
          "POST",
          { decision: "approve", note: "Correction checked." },
          reviewer,
        )
      ).status,
      200,
    );
    const old = (await (await call(`/verify/${approved.certificate}`)).json())
      .data;
    assert.equal(old.status, "Revoked");
    assert.match(old.reason, /Replaced by CRD/);
    const ownRequest = (
      await (await call("/requests", "POST", { certificate }, owner)).json()
    ).data;
    assert.equal(
      (
        await call(
          `/requests/${ownRequest.id}/review`,
          "POST",
          { decision: "approve", note: "Self approval." },
          owner,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          `/staff/${accounts.issuer.id}`,
          "PATCH",
          { active: false, role: "issuer" },
          owner,
        )
      ).status,
      200,
    );
    assert.equal((await call("/requests", "GET", null, issuer)).status, 401);
    assert.equal(
      (await call("/login", "POST", { email: "issuer@example.com", password }))
        .status,
      401,
    );
    const audit = (await (await call("/audit", "GET", null, owner)).json())
      .data;
    assert.ok(audit.some((x) => x.action === "Request approved"));
    assert.equal((await call("/deliveries", "GET", null, owner)).status, 200);
    assert.equal(
      (
        await call(
          `/certificates/${approved.certificate}/email`,
          "POST",
          {},
          owner,
        )
      ).status,
      503,
    );
    return { secret };
  } finally {
    await new Promise((r) => server.close(r));
  }
}
