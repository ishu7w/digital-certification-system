import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { openDatabase } from "../server/db.js";
import { createApp } from "../server/app.js";
import { totp } from "../server/mfa.js";
test("Owner enables authenticator security and must supply a new code to sign in", async ({
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
  if (!address || typeof address === "string") throw Error("Missing address");
  const base = `http://127.0.0.1:${address.port}`;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    await route.fulfill({
      response: await route.fetch({
        url: base + new URL(request.url()).pathname,
        headers: { ...request.headers(), origin: base },
      }),
    });
  });
  const signIn = async (code?: string) => {
    await page.getByRole("button", { name: "Administrator sign in" }).click();
    await page
      .getByLabel("Email address", { exact: true })
      .fill("owner@example.com");
    await page.getByLabel("Password", { exact: true }).fill(password);
    if (code) await page.getByLabel("Authenticator code").fill(code);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
  };
  try {
    await page.goto("/?workspace");
    await signIn();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: "Workspace settings" }).click();
    await page.getByRole("button", { name: "Manage account security" }).click();
    await page.getByLabel("Current password").fill(password);
    await page
      .getByRole("button", { name: "Generate recovery codes", exact: true })
      .click();
    await page.getByRole("button", { name: "I have saved my codes" }).click();
    await page
      .getByRole("button", { name: "Two-factor authentication", exact: true })
      .click();
    await page.getByLabel("Current password").fill(password);
    await page.getByRole("button", { name: "Set up authenticator" }).click();
    await expect(
      page.getByAltText("Authenticator enrollment QR code"),
    ).toBeVisible();
    const secret = await page.getByLabel("Manual setup key").inputValue();
    await page
      .getByLabel("Authenticator code")
      .fill(totp(secret, Math.floor(Date.now() / 30000)));
    await page.getByRole("button", { name: "Enable and sign out" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await signIn();
    await expect(page.getByRole("alert")).toContainText(
      "authenticator code is required",
    );
    await page
      .getByLabel("Authenticator code")
      .fill(totp(secret, Math.floor(Date.now() / 30000) + 1));
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    await new Promise((r) => server.close(r));
    db.close();
  }
});
test("Staff invitation acceptance and issuer review UI are functional", async ({
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
  if (!address || typeof address === "string") throw Error("Missing address");
  const base = `http://127.0.0.1:${address.port}`;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    await route.fulfill({
      response: await route.fetch({
        url: base + new URL(request.url()).pathname,
        headers: { ...request.headers(), origin: base },
      }),
    });
  });
  const signIn = async (email: string) => {
    await page.getByRole("button", { name: "Administrator sign in" }).click();
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  };
  try {
    await page.goto("/?workspace");
    await signIn("owner@example.com");
    await page.getByRole("button", { name: "Workspace settings" }).click();
    await page.getByRole("button", { name: "Manage staff" }).click();
    await page.getByLabel("Full name").fill("Test Issuer");
    await page
      .getByLabel("Email address", { exact: true })
      .fill("issuer@example.com");
    await page.getByRole("combobox", { name: /^Role/ }).selectOption("issuer");
    await page.getByRole("button", { name: "Create invitation" }).click();
    const invitation = page.getByLabel(/Private invitation/);
    await expect(invitation).toHaveValue(/#invite=/);
    const link = await invitation.inputValue();
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByText("You have been signed out.", { exact: true }),
    ).toBeVisible();
    await page.goto("/?workspace" + new URL(link).hash);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await page
      .getByLabel("Email address", { exact: true })
      .fill("issuer@example.com");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: "Workspace settings" }).click();
    await expect(
      page.getByRole("button", { name: "Manage staff" }),
    ).not.toBeVisible();
    await page.getByRole("button", { name: "Open review requests" }).click();
    await page
      .getByLabel("Recipient", { exact: true })
      .fill("Reviewed Recipient");
    await page
      .getByLabel("Email address", { exact: true })
      .fill("recipient@example.com");
    await page
      .getByLabel("Achievement", { exact: true })
      .fill("Reviewed Course");
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(
      page.getByRole("cell", { name: "pending", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Approve", exact: true }),
    ).not.toBeVisible();
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    await new Promise((r) => server.close(r));
    db.close();
  }
});
