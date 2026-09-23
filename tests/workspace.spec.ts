import { test, expect } from "@playwright/test";
for (const width of [375, 768, 1280]) {
  test(`workspace fits at ${width}px and certificate dialog is accessible`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: "A little clarity. A lot of confidence.",
      }),
    ).toBeVisible();
    await expect(page.getByText("Aarav Sharma", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page
      .getByRole("button", { name: "View certificate for Aarav Sharma" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByAltText("QR code linking to certificate verification"),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.screenshot({
      path: `test-results/overview-${width}.png`,
      fullPage: true,
    });
  });
}
test("search, filters, pagination, export and verification work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await page.getByRole("button", { name: "View all certificates" }).click();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("2 / 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Expired", exact: true }).click();
  await expect(page.getByText("Rohan Desai", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Aarav Sharma", { exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole("button", { name: "All certificates", exact: false })
    .click();
  await page
    .getByRole("textbox", { name: "Filter by name, course or ID" })
    .fill("Aarav");
  await expect(page.getByText("Aarav Sharma", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("credence-certificates");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Verify a certificate" })
    .click();
  await page
    .getByRole("textbox", { name: "Certificate ID", exact: true })
    .fill(`CRD-${new Date().getFullYear()}-1001`);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByText("This certificate is authentic.")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Certificate ID", exact: true })
    .fill("CRD-2026-FFFFAAAA");
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(
    page.getByText("We couldn’t verify this certificate"),
  ).toBeVisible();
});
test("direct verification works and guests cannot open issuance form", async ({
  page,
}) => {
  await page.goto(`/?verify=CRD-${new Date().getFullYear()}-1001`);
  await expect(page.getByText("This certificate is authentic.")).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Issue certificate", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});
