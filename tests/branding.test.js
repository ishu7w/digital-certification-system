import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { openDatabase } from "../server/db.js";
import { asyncDatabase } from "../server/storage.js";
import { createCertificateService } from "../server/certificates.js";
import { certificatePdf } from "../server/pdf.js";
import { createBackup, restoreBackup } from "../server/backup.js";
test("Logo assets are deduplicated, snapshots survive branding changes and encrypted restore", async () => {
  const source = openDatabase(":memory:"),
    db = asyncDatabase(source),
    target = openDatabase(":memory:"),
    secret = randomBytes(32).toString("hex");
  const logo =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6ioAAAAASUVORK5CYII=";
  const input = {
    recipient: "Logo Recipient",
    email: "recipient@example.com",
    course: "Branding Course",
    category: "Achievement",
    issuedAt: "2026-01-01",
    expiresAt: null,
  };
  try {
    await db
      .prepare("INSERT INTO settings (key,value) VALUES (?,?)")
      .run(
        "institution",
        JSON.stringify({
          name: "Brand Academy",
          signatory: "Brand Registrar",
          template: "modern",
          logo,
        }),
      );
    const service = createCertificateService(db, secret),
      first = await service.issue(input),
      second = await service.issue(input);
    assert.equal(first.issuer.logoHash, second.issuer.logoHash);
    assert.equal(first.issuer.logo, undefined);
    assert.equal(
      source
        .prepare(
          "SELECT COUNT(*) AS count FROM settings WHERE key LIKE 'logo:%'",
        )
        .get().count,
      1,
    );
    await db
      .prepare("UPDATE settings SET value = ? WHERE key = ?")
      .run(
        JSON.stringify({
          name: "New Academy",
          signatory: "New Registrar",
          logo: null,
        }),
        "institution",
      );
    assert.equal(
      (await certificatePdf(first, "https://example.com", db))
        .subarray(0, 4)
        .toString(),
      "%PDF",
    );
    const bytes = await createBackup(db, secret, "z".repeat(32));
    await restoreBackup(asyncDatabase(target), secret, "z".repeat(32), bytes);
    const restored = createCertificateService(target, secret);
    const record = restored.present(await restored.get(first.id));
    assert.equal(record.status, "Active");
    assert.equal(record.issuer.name, "Brand Academy");
    assert.equal(
      (
        await certificatePdf(
          record,
          "https://example.com",
          asyncDatabase(target),
        )
      )
        .subarray(0, 4)
        .toString(),
      "%PDF",
    );
  } finally {
    source.close();
    target.close();
  }
});
