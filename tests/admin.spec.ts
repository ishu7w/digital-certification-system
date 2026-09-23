import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { openDatabase } from "../server/db.js";
import { createApp } from "../server/app.js";
import type { Server } from "node:http";
let server: Server;
let base: string;
const db = openDatabase(":memory:");
const password = randomBytes(24).toString("hex");
test.beforeAll(async () => {
  const app = createApp({
    db,
    secret: randomBytes(32).toString("hex"),
    adminEmail: "qa@example.com",
    passwordHash: await bcrypt.hash(password, 12),
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (typeof address !== "object" || !address)
    throw new Error("Missing test server address");
  base = `http://127.0.0.1:${address.port}`;
});
test.afterAll(() => {
  server.close();
  db.close();
});
test("administrator can sign in, issue, verify, revoke, and sign out", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const response = await route.fetch({
      url: base + url.pathname,
      headers: { ...request.headers(), origin: base },
    });
    await route.fulfill({ response });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Issue certificate", exact: true })
    .click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("qa@example.com");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("Administrator", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Issue certificate", exact: true })
    .click();
  await page.getByLabel("Full name").fill("Browser Test Recipient");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("recipient@example.com");
  await page
    .getByLabel("Course or achievement")
    .fill("Full Stack Verification");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Issue certificate", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Certificate details", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Browser Test Recipient", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Superseded by an updated qualification.");
  await page.getByRole("button", { name: "Confirm revocation" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByText("Certificate revoked. The verification record is updated."),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "View certificate for Browser Test Recipient",
    })
    .click();
  await expect(
    page.getByRole("dialog").getByText("Revoked", { exact: true }).first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByText("Guest workspace", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Browser Test Recipient", { exact: true }),
  ).not.toBeVisible();
});
