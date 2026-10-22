import { expect, test } from "@playwright/test";

test("a customer pays at the counter and gets a receipt", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start your order" }).click();
  await expect(page.getByRole("heading", { name: "Coxinha" })).toBeVisible();
  await page.getByRole("button", { name: "Add Coxinha" }).click();
  await page.getByRole("button", { name: "Confirm order" }).click();
  await page.getByRole("button", { name: "Pay at pickup" }).click();
  await expect(page.getByText(/at the counter/i)).toBeVisible();
  await expect(page.getByText("1× Coxinha")).toBeVisible();
});

test("a declined card is recovered by paying at pickup", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start your order" }).click();
  await page.getByRole("button", { name: "Add Water" }).click();
  await page.getByRole("button", { name: "Confirm order" }).click();
  await page.getByRole("button", { name: "Card", exact: true }).click();
  await page.getByText("Demo tools").click();
  await page.getByLabel("Force card outcome").selectOption("declined");
  await page.getByRole("button", { name: "Tap your card" }).click();
  await expect(page.getByRole("heading", { name: /your card was declined/i })).toBeVisible();
  await page.getByRole("button", { name: "Pay at pickup" }).click();
  await expect(page.getByText(/at the counter/i)).toBeVisible();
});

test("a customer pays by card and gets a paid receipt", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start your order" }).click();
  await page.getByRole("button", { name: "Add Water" }).click();
  await page.getByRole("button", { name: "Confirm order" }).click();
  await page.getByRole("button", { name: "Card", exact: true }).click();
  await page.getByRole("button", { name: "Tap your card" }).click();
  await expect(page.getByText("Paid by card")).toBeVisible();
});
