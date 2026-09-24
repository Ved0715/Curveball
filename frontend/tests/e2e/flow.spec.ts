import { expect, test } from "@playwright/test";

test("setup → brief → interview → report → history", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("before it counts");
  await page.getByRole("link", { name: "Start a mock interview" }).click();

  // Setup: role is required
  await expect(page.getByText("Demo mode")).toBeVisible();
  await page.getByRole("button", { name: /Build my prep brief/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Add the role" })).toBeVisible();
  await page.getByLabel("Role").fill("Backend Engineer");
  await page.getByLabel("Company").fill("Razorpay");
  await page.getByText("4 questions").click();
  await page.getByLabel("Your resume").fill("Built a UPI reconciliation service in Go. Cut p95 latency 40%.");
  await page.getByRole("button", { name: /Build my prep brief/ }).click();

  // Brief
  await expect(page.getByRole("heading", { name: /prep brief/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Questions you'll likely get")).toBeVisible();
  await page.getByRole("button", { name: "Start the mock interview" }).click();

  // Interview: answer until it closes
  const answer = page.getByLabel("Your answer");
  for (let i = 0; i < 12; i++) {
    const wrap = page.getByRole("heading", { name: "That's a wrap." });
    await expect(answer.or(wrap)).toBeEnabled({ timeout: 20_000 });
    if (await wrap.isVisible()) break;
    await answer.fill(`I owned the migration end to end and cut latency by 40% (answer ${i + 1}).`);
    await page.getByRole("button", { name: /^Send/ }).click();
    if (i === 0) {
      // The interview lives on the server: a reload picks up exactly where we were.
      await expect(page.getByText(/Question 2 of 4|follow-up/)).toBeVisible({ timeout: 20_000 });
      await page.reload();
      await page.getByText(/Transcript \(/).click();
      await expect(page.getByText("(answer 1)")).toBeVisible();
    }
  }
  await expect(page.getByText("Interview finished")).toBeVisible();

  await expect(page.getByText("(answer 1)")).toBeVisible();

  // Report
  await page.getByRole("button", { name: /Get my report/ }).click();
  await expect(page.getByRole("heading", { name: /How it/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel(/Overall score \d+ out of 100/)).toBeVisible();
  await expect(page.getByText("Answer by answer")).toBeVisible();

  // History, then delete everything
  await page.getByRole("link", { name: "History" }).click();
  await expect(page.getByText("Backend Engineer at Razorpay")).toBeVisible();
  await page.getByRole("button", { name: "Delete all my data" }).click();
  await page.getByRole("button", { name: "Delete everything" }).click();
  await expect(page.getByText("No interviews yet")).toBeVisible();
});

test("ending early with no answers goes back to setup", async ({ page }) => {
  await page.goto("/practice");
  await page.getByLabel("Role").fill("Product Analyst");
  await page.getByRole("button", { name: /Skip to interview/ }).click();
  await expect(page.getByLabel("Your answer")).toBeEnabled({ timeout: 20_000 });
  await page.getByRole("button", { name: /I'm stuck/ }).click();
  await expect(page.getByText(/They're testing/)).toBeVisible();
  await page.getByRole("button", { name: "End", exact: true }).click();
  await page.getByRole("button", { name: "Leave" }).click();
  await expect(page).toHaveURL(/\/practice$/);
});
