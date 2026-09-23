import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("main workspace screens meet automated WCAG A/AA checks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.getByText("Aarav Sharma", { exact: true })).toBeVisible();
  for (const name of [
    "Overview",
    "Certificates",
    "Verify a certificate",
    "Activity",
    "Workspace settings",
  ]) {
    if (name !== "Overview")
      await page
        .getByRole("button", { name, exact: name !== "Certificates" })
        .first()
        .click();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations, `${name} accessibility violations`).toEqual([]);
  }
});
