import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const width of [375, 768, 1440])
  test(`immersive entrance at ${width}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Credentials, verified." }),
    ).toBeVisible();
    await expect(
      page
        .locator(".vault-scene canvas, .vault-scene[data-fallback=true]")
        .first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.getByRole("button", { name: "Sage scene" }).click();
    await expect(
      page.getByRole("button", { name: "Sage scene" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "Play animation" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open experience menu" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page
      .getByRole("button", { name: "Verify a certificate", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Verify a certificate",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to experience" }).click();
    await expect(
      page.getByRole("heading", { name: "Credentials, verified." }),
    ).toBeVisible();
  });
test("entrance honors reduced motion and passes automated accessibility checks", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Play animation" }),
  ).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        reason: n.failureSummary,
      })),
    })),
  ).toEqual([]);
});

test("scroll chapters remain usable with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore" }).click();
  await expect(
    page.getByRole("region", { name: "Digital identity chapter" }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Play animation" }),
  ).toBeInViewport();
  await page
    .getByRole("button", { name: "Check a certificate", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Verify a certificate",
    }),
  ).toBeVisible();
});
