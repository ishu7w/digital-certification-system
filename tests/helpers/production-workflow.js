import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PDFDocument } from "pdf-lib";
import { openDatabase } from "../../server/db.js";
import { asyncDatabase } from "../../server/storage.js";
import { createApp } from "../../server/app.js";
import { createCertificateService } from "../../server/certificates.js";
import { createBackup, restoreBackup } from "../../server/backup.js";

export async function productionWorkflow(rawDb, otherDb) {
  const db = asyncDatabase(rawDb),
    secret = randomBytes(32).toString("hex"),
    password = randomBytes(20).toString("hex"),
    encryptionKey = randomBytes(32).toString("hex");
  await db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run(
    "adminCredentials",
    JSON.stringify({
      email: "owner@example.com",
      passwordHash: await bcrypt.hash(password, 12),
    }),
  );
  const app = createApp({
    db,
    secret,
    demoMode: false,
    adminEmail: "owner@example.com",
    passwordHash: await bcrypt.hash(password, 12),
    publicOrigin: "https://example.com",
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = "";
  const request = (path, method = "GET", body, auth = true) =>
    fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: base,
        ...(auth ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    let response = await request("/login", "POST", {
      email: "owner@example.com",
      password,
    });
    assert.equal(response.status, 200);
    cookie = response.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (
        await request(
          "/institution",
          "PUT",
          { name: "Test Institute", signatory: "Test Registrar" },
          false,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/institution", "PUT", {
          name: "Test Institute",
          signatory: "Test Registrar",
        })
      ).status,
      200,
    );
    const row = {
      recipient: "Élodie Test",
      email: "private@example.com",
      course: "Certificate Test",
      category: "Achievement",
      issuedAt: "2026-01-01",
      expiresAt: "",
    };
    assert.equal(
      (
        await (
          await request("/certificates/bulk/preview", "POST", {
            rows: [row, row],
          })
        ).json()
      ).data.errors.length,
      1,
    );
    const key = crypto.randomUUID();
    response = await request("/certificates/bulk", "POST", {
      rows: [
        row,
        { ...row, email: "second@example.com", recipient: "Second Test" },
      ],
      key,
    });
    assert.equal(response.status, 201);
    const issued = (await response.json()).data;
    assert.equal(issued.length, 2);
    assert.equal(issued[0].issuer.name, "Test Institute");
    const retry = await request("/certificates/bulk", "POST", {
      rows: [
        row,
        { ...row, email: "second@example.com", recipient: "Second Test" },
      ],
      key,
    });
    assert.equal((await retry.json()).data[0].id, issued[0].id);
    assert.equal(
      (await request("/certificates/bulk", "POST", { rows: [row], key }))
        .status,
      409,
    );
    assert.equal(
      (
        await request("/certificates/bulk", "POST", {
          rows: [row],
          key: crypto.randomUUID(),
        })
      ).status,
      400,
    );
    await request("/institution", "PUT", {
      name: "New Institute",
      signatory: "New Registrar",
    });
    const verified = (await (await request("/verify/" + issued[0].id)).json())
      .data;
    assert.equal(verified.issuer.name, "Test Institute");
    assert.equal(verified.email, undefined);
    response = await request(`/certificates/${issued[0].id}/pdf`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /pdf/);
    const bytes = await response.arrayBuffer();
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
    assert.equal(
      (
        await request(
          `/certificates/${issued[0].id}/pdf`,
          "GET",
          undefined,
          false,
        )
      ).status,
      401,
    );
    const encrypted = await createBackup(db, secret, encryptionKey);
    assert.ok(!encrypted.toString().includes("private@example.com"));
    await assert.rejects(
      restoreBackup(
        otherDb,
        secret,
        "wrong-encryption-password-that-is-long-enough",
        encrypted,
      ),
    );
    const restored = await restoreBackup(
      otherDb,
      secret,
      encryptionKey,
      encrypted,
    );
    assert.equal(restored.certificates, 2);
    assert.ok(
      await otherDb
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("adminCredentials"),
    );
    assert.equal(
      (await createCertificateService(otherDb, secret).verify(issued[0].id))
        .status,
      "Active",
    );
    await assert.rejects(
      restoreBackup(otherDb, secret, encryptionKey, encrypted),
      /empty/,
    );
    response = await request("/recovery-codes", "POST", {
      currentPassword: password,
    });
    assert.equal(response.status, 200);
    const codes = (await response.json()).data.codes;
    assert.equal(codes.length, 10);
    assert.ok(
      !(
        await db
          .prepare("SELECT value FROM settings WHERE key = ?")
          .get("recoveryCodes")
      ).value.includes(codes[0]),
    );
    const nextPassword = randomBytes(20).toString("hex");
    assert.equal(
      (
        await request(
          "/recover",
          "POST",
          {
            email: "owner@example.com",
            code: codes[0],
            newPassword: nextPassword,
          },
          false,
        )
      ).status,
      200,
    );
    assert.equal((await request("/certificates")).status, 401);
    assert.equal(
      (
        await request(
          "/recover",
          "POST",
          {
            email: "owner@example.com",
            code: codes[0],
            newPassword: nextPassword,
          },
          false,
        )
      ).status,
      401,
    );
    response = await request("/login", "POST", {
      email: "owner@example.com",
      password: nextPassword,
    });
    assert.equal(response.status, 200);
    cookie = response.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (
        await request("/sessions/revoke", "POST", {
          currentPassword: nextPassword,
        })
      ).status,
      200,
    );
    assert.equal((await request("/certificates")).status, 401);
  } finally {
    await new Promise((r) => server.close(r));
  }
}
