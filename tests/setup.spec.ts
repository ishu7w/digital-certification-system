import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { openDatabase } from "../server/db.js";
import { createApp } from "../server/app.js";

test("owner enrolls once, signs in, and changes their password", async ({
  page,
}) => {
  const db = openDatabase(":memory:");
  const token = randomBytes(32).toString("hex");
  const password = randomBytes(24).toString("hex");
  const nextPassword = randomBytes(24).toString("hex");
  const server = createApp({
    db,
    secret: randomBytes(32).toString("hex"),
    demoMode: false,
    setupToken: token,
    setupExpiresAt: Date.now() + 60000,
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test address");
  const base = `http://127.0.0.1:${address.port}`;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    await route.fulfill({
      response: await route.fetch({
        url: base + url.pathname,
        headers: { ...request.headers(), origin: base },
      }),
    });
  });
  try {
    await page.goto(`/?setup#token=${token}`);
    await expect(page).toHaveURL(/\?setup$/);
    await page
      .getByLabel("Email address", { exact: true })
      .fill("owner@example.com");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Create administrator account" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Administrator ready" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Open workspace" }).click();
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
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await page.getByLabel("Current password", { exact: true }).fill(password);
    await page.getByLabel("New password", { exact: true }).fill(nextPassword);
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill(nextPassword);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(
      page.getByText("Password changed. Sign in again with your new password."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Administrator sign in" }),
    ).toBeVisible();
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
