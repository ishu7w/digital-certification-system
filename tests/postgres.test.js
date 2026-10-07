import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { postgresDatabase } from "../server/storage.js";
import { createApp } from "../server/app.js";
import { createCertificateService } from "../server/certificates.js";

test(
  "PostgreSQL persists records and sessions across instances and serializes revocation",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const schema = `credence_test_${randomBytes(8).toString("hex")}`;
    const url = new URL(
      process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    );
    url.searchParams.set("sslmode", "verify-full");
    const control = new pg.Client({ connectionString: url.toString() });
    await control.connect();
    await control.query(`CREATE SCHEMA ${schema}`);
    const db = postgresDatabase(url.toString(), { schema });
    const second = postgresDatabase(url.toString(), { schema });
    let firstServer, secondServer;
    try {
      await db.migrate();
      const secret = randomBytes(32).toString("hex"),
        token = randomBytes(32).toString("hex"),
        password = randomBytes(24).toString("hex");
      const options = {
        secret,
        demoMode: false,
        production: true,
        setupToken: token,
        setupExpiresAt: Date.now() + 60000,
      };
      firstServer = createApp({ ...options, db }).listen(0, "127.0.0.1");
      await new Promise((resolve) => firstServer.once("listening", resolve));
      const base = `http://127.0.0.1:${firstServer.address().port}/api`;
      const request = (path, body) =>
        fetch(base + path, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: base },
          body: JSON.stringify(body),
        });
      assert.equal(
        (
          await request("/setup", {
            token,
            password,
            email: "test@example.com",
          })
        ).status,
        201,
      );
      const login = await request("/login", {
        password,
        email: "test@example.com",
      });
      assert.match(login.headers.get("set-cookie"), /Secure/);
      const cookie = login.headers.get("set-cookie").split(";")[0];
      const service = createCertificateService(db, secret);
      const cert = await service.issue({
        recipient: "Database Test",
        email: "private@example.com",
        course: "Persistent certificate",
        category: "Achievement",
        issuedAt: "2026-01-01",
      });
      secondServer = createApp({ ...options, db: second }).listen(
        0,
        "127.0.0.1",
      );
      await new Promise((resolve) => secondServer.once("listening", resolve));
      const secondBase = `http://127.0.0.1:${secondServer.address().port}/api`;
      assert.equal(
        (
          await (
            await fetch(secondBase + "/session", {
              headers: { Cookie: cookie },
            })
          ).json()
        ).data.role,
        "admin",
      );
      assert.equal((await fetch(secondBase + "/certificates")).status, 401);
      const publicData = (
        await (await fetch(secondBase + "/verify/" + cert.id)).json()
      ).data;
      assert.equal(publicData.status, "Active");
      assert.equal(publicData.email, undefined);
      const otherService = createCertificateService(second, secret);
      const outcomes = await Promise.allSettled([
        service.revoke(cert.id, "Test revocation"),
        otherService.revoke(cert.id, "Duplicate revocation"),
      ]);
      assert.equal(
        outcomes.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal((await otherService.verify(cert.id)).status, "Revoked");
      assert.equal(
        (await otherService.activity(false)).filter(
          (event) => event.action === "Revoked",
        ).length,
        1,
      );
      await db
        .prepare("UPDATE certificates SET reason = ? WHERE id = ?")
        .run("Tampered reason", cert.id);
      assert.equal((await otherService.verify(cert.id)).status, "Invalid");
    } finally {
      if (firstServer)
        await new Promise((resolve) => firstServer.close(resolve));
      if (secondServer)
        await new Promise((resolve) => secondServer.close(resolve));
      await db.close();
      await second.close();
      await control.query(`DROP SCHEMA ${schema} CASCADE`);
      await control.end();
    }
  },
);
