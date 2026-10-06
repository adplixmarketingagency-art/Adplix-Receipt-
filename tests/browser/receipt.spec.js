import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("edit multiple services, preview accurate totals, remove, and download", async ({
  page,
}) => {
  const exceptions = [];
  page.on("pageerror", (error) => exceptions.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "New Receipt" }).first(),
  ).toBeVisible();
  await expect(page.getByLabel("Organisation name")).toHaveCount(0);
  await page.getByRole("button", { name: "New Receipt" }).first().click();
  await expect(
    page.getByRole("img", { name: "Receipt preview page 1" }),
  ).toBeVisible();
  await expect(page.getByLabel("Service", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Price (INR)", { exact: true })).toHaveValue("");
  await expect(page.locator("#service-options option")).toHaveCount(8);
  await page.getByLabel("Organisation name").fill("Example Studio");
  await page.getByLabel("Service", { exact: true }).first().fill("Social media handling");
  await page.getByLabel("Price (INR)", { exact: true }).fill("0.10");
  await page.getByLabel("Amount paid (INR)", { exact: true }).fill("0.10");
  await page.getByRole("button", { name: "Add another service" }).click();
  await expect(
    page.getByRole("heading", { name: "Services", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Service", { exact: true })
    .nth(1)
    .fill("Video production");
  await page.getByLabel("Price (INR)", { exact: true }).nth(1).fill("0.20");
  await expect(page.locator(".total-panel .total-row").first()).toContainText(
    "₹0.30",
  );
  await expect(page.locator(".preview-paper")).toContainText("Example Studio");
  await expect(page.locator(".preview-paper")).toContainText("₹0.30");
  await page.getByRole("radio", { name: "Invoice", exact: true }).check();
  await expect(page.locator(".preview-paper")).toContainText("INVOICE NO: 185");
  await page.getByRole("button", { name: "Remove item 2" }).click();
  await expect(page.locator(".total-panel .total-row").first()).toContainText(
    "₹0.10",
  );
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".heading-download").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("invoice-185.pdf");
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  await expect(page.locator(".heading-download")).toBeEnabled();
  expect(exceptions).toEqual([]);
  await expect(page.locator(".preview-status")).toHaveText(
    "Updates as you type",
  );
  await expect(page.locator(".preview-paper")).not.toContainText(
    "Video production",
  );
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
});

test("invalid, blank, and negative amounts never crash and block export", async ({
  page,
}) => {
  const exceptions = [];
  const downloads = [];
  page.on("pageerror", (error) => exceptions.push(error.message));
  page.on("download", (download) => downloads.push(download));
  await page.goto("/");
  await page.getByRole("button", { name: "New Receipt" }).first().click();
  await page.locator(".heading-download").click();
  await expect(page.locator(".error-summary")).toBeFocused();
  await expect(page.getByLabel("Organisation name")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByLabel("Organisation name").fill("Example Studio");
  for (const value of ["", "-5", "0.001", "abc"]) {
    await page.getByLabel("Price (INR)", { exact: true }).fill(value);
    await expect(
      page.getByRole("heading", { name: "Create a receipt." }),
    ).toBeVisible();
    await page.locator(".heading-download").click();
    await expect(
      page.getByLabel("Price (INR)", { exact: true }),
    ).toHaveAttribute("aria-invalid", "true");
  }
  await page.getByRole("button", { name: "Remove item 1" }).click();
  await page.locator(".heading-download").click();
  await expect(page.locator("#services-error")).toContainText(
    "Add at least one service",
  );
  expect(exceptions).toEqual([]);
  expect(downloads).toEqual([]);
});

test("new receipt increments the current receipt number", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Receipt" }).first().click();
  const number = page.getByLabel("Document number");
  await expect(number).toHaveValue("185");
  await number.fill("500");
  await page.getByRole("button", { name: "New Receipt" }).last().click();
  await expect(page.getByLabel("Document number")).toHaveValue("501");
  await expect(page.getByLabel("Service", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Price (INR)", { exact: true })).toHaveValue("");
});

test("phone layout has no page overflow and supports optional business settings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "New Receipt" }).first().click();
  await expect(
    page.getByRole("img", { name: "Receipt preview page 1" }),
  ).toBeVisible();
  await page
    .getByLabel("Organisation name")
    .fill("A considerably longer customer organisation for a small screen");
  await page.getByText("Business & payment details", { exact: true }).click();
  await page
    .getByLabel("Account holder", { exact: true })
    .fill("Example Holder");
  await expect(page.locator(".preview-paper")).toContainText("Example Holder");
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
  await expect(page.locator(".mobile-download")).toBeVisible();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.setViewportSize({ width: 812, height: 375 });
  const landscape = await page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  );
  expect(landscape).toBe(true);
});

test("PDF asset failure shows an error and recovers on retry", async ({
  page,
}) => {
  await page.route("**/assets/Poppins-Regular.ttf", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "New Receipt" }).first().click();
  await expect(
    page.getByText(
      "The preview could not be generated. Edit a field to try again.",
    ),
  ).toBeVisible();
  await page.getByLabel("Organisation name").fill("Example Studio");
  await page.getByLabel("Service", { exact: true }).fill("Website");
  await page.getByLabel("Price (INR)", { exact: true }).fill("100");
  await page.getByLabel("Amount paid (INR)", { exact: true }).fill("100");
  await page.locator(".heading-download").click();
  await expect(page.locator(".error-summary")).toContainText(
    "Your PDF could not be downloaded",
  );
  await page.unroute("**/assets/Poppins-Regular.ttf");
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".heading-download").click();
  expect((await downloadPromise).suggestedFilename()).toBe("receipt-185.pdf");
});
