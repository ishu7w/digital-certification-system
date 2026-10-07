import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { openDatabase } from "../server/db.js";
import { createApp } from "../server/app.js";
test("administrator configures institution, reviews CSV, downloads PDF and saves recovery codes", async ({
  page,
}) => {
  const db = openDatabase(":memory:"),
    password = randomBytes(20).toString("hex");
  const server = createApp({
    db,
    secret: randomBytes(32).toString("hex"),
    demoMode: false,
    adminEmail: "owner@example.com",
    passwordHash: await bcrypt.hash(password, 12),
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing address");
  const base = `http://127.0.0.1:${address.port}`;
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    await route.fulfill({
      response: await route.fetch({
        url: base + new URL(req.url()).pathname,
        headers: { ...req.headers(), origin: base },
      }),
    });
  });
  try {
    await page.goto("/?workspace");
    await page.getByRole("button", { name: "Administrator sign in" }).click();
    await page
      .getByLabel("Email address", { exact: true })
      .fill("owner@example.com");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: "Workspace settings" }).click();
    await page
      .getByRole("button", { name: "Edit institution details" })
      .click();
    await page.getByLabel("Institution name").fill("Production Test Academy");
    await page.getByLabel("Authorised signatory").fill("Test Registrar");
    await page
      .getByRole("button", { name: "Save institution details" })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Production Test Academy",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Certificates 0" }).click();
    await page.getByRole("button", { name: "Bulk issue", exact: true }).click();
    await page.getByLabel("Certificate CSV").setInputFiles({
      name: "certificates.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "recipient,email,course,category,issuedAt,expiresAt\nTest Recipient,recipient@example.com,Production Course,Achievement,2026-01-01,\n",
      ),
    });
    await expect(
      page.getByRole("cell", { name: "Test Recipient recipient@example.com" }),
    ).toBeVisible();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Issue 1 certificates" }).click();
    await expect(
      page.getByText("1 certificates issued.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /View certificate for Test Recipient/ })
      .click();
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download PDF", exact: true })
      .click();
    expect((await downloadPromise).suggestedFilename()).toMatch(/\.pdf$/);
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.getByRole("button", { name: "Workspace settings" }).click();
    await page.getByRole("button", { name: "Manage account security" }).click();
    await page.getByLabel("Current password").fill(password);
    await page
      .getByRole("button", { name: "Generate recovery codes", exact: true })
      .click();
    await expect(page.locator(".recovery-code-list")).toContainText(
      /^[a-f0-9-]+/,
    );
    await page.getByRole("button", { name: "I have saved my codes" }).click();
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
  }
});
