import { expect, test, type Page } from "@playwright/test";

/** Nothing on the page may be wider than the screen (no sideways scrolling on phones). */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page is wider than the viewport").toBeLessThanOrEqual(1);
}

async function signUp(page: Page, name = "Asha Rao") {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill("correct horse 1");
  await page.getByRole("button", { name: /Create account/ }).click();
  await expect(page).toHaveURL(/\/today$/);
  return email;
}

const RESUME = `Asha Rao — Backend Engineer, 3 years building payment systems at scale
Razorpay, Software Engineer II (2022 – Present). Built a UPI reconciliation service in Go. Cut p95 latency 40%.
Skills: Go, Python, Postgres, Kafka`;

test("auth: protected pages redirect to login and back; logout; bad password", async ({ page }) => {
  await page.goto("/progress");
  await expect(page).toHaveURL(/\/login\?next=%2Fprogress/);
  await page.getByRole("link", { name: "Create an account" }).click();
  const email = await (async () => {
    await page.getByLabel("Your name").fill("Asha Rao");
    const e = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    await page.getByLabel("Email").fill(e);
    await page.getByLabel(/^Password/).fill("correct horse 1");
    await page.getByRole("button", { name: /Create account/ }).click();
    return e;
  })();
  await expect(page).toHaveURL(/\/progress$/); // came back to where we were going
  await page.goto("/settings");
  await page.getByRole("button", { name: /Log out/ }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill("wrong password");
  await page.getByRole("button", { name: /^Log in/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "don't match" })).toBeVisible();
  await page.getByLabel(/^Password/).fill("correct horse 1");
  await page.getByRole("button", { name: /^Log in/ }).click();
  await expect(page).toHaveURL(/\/today$/);
});

test("daily loop: topic → lesson → reflection → learned → progress → settings", async ({ page }) => {
  await signUp(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Asha");
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible(); // today's topic title
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: /Teach me in 5 min/ }).click();
  await expect(page.getByText("Your 5-minute lesson")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /Think first, then reveal/ }).first().click();
  await page.getByRole("button", { name: /I answered all three/ }).click();
  await expect(page.getByText("Check done")).toBeVisible();

  await page.getByRole("button", { name: /Mark as learned/ }).click();
  await page.getByLabel(/What clicked today/).fill("Two pointers turn nested loops into one pass.");
  await page.getByRole("button", { name: /Done for today/ }).click();
  await expect(page.getByText("Done for today. New topic tomorrow")).toBeVisible();
  await expect(page.getByText("Two pointers turn nested loops into one pass.")).toBeVisible();
  await expect(page.locator('[aria-label="1-day learning streak"]:visible').first()).toBeVisible();

  await page.getByRole("link", { name: "Progress" }).first().click();
  await expect(page.getByRole("heading", { name: /Your curve/ })).toBeVisible();
  await expect(page.getByText("20 / 50 XP")).toBeVisible(); // learned 10 + reflection 5 + check 5
  await expect(page.getByText("Two pointers turn nested loops into one pass.")).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole("link", { name: "Settings" }).first().click();
  const dsa = page.getByRole("button", { name: /Data Structures & Algorithms/ });
  await expect(dsa).toHaveAttribute("aria-pressed", "true");
  await dsa.click();
  await expect(dsa).toHaveAttribute("aria-pressed", "false");
  await expectNoHorizontalScroll(page);
});

test("practice loop: interview → report → weak spot lands in the learning queue", async ({ page }) => {
  await signUp(page);
  await page.getByRole("link", { name: "Practice" }).first().click();
  await expect(page.getByText("Demo mode")).toBeVisible();
  await page.getByRole("button", { name: /Build my prep brief/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Add the role" })).toBeVisible();
  await page.getByLabel("Role").fill("Backend Engineer");
  await page.getByLabel("Company").fill("Razorpay");
  await page.getByText("4 questions").click();
  await page.getByLabel("Your resume").fill(RESUME);
  await page.getByRole("button", { name: /Build my prep brief/ }).click();

  await expect(page.getByRole("heading", { name: /prep brief/i })).toBeVisible({ timeout: 20_000 });
  const profile = page.getByRole("button", { name: /What we read from your resume/ });
  await profile.click();
  await expect(page.getByText("Numbers you can cite")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Start the mock interview" }).click();

  const answer = page.getByLabel("Your answer");
  for (let i = 0; i < 12; i++) {
    const wrap = page.getByRole("heading", { name: "That's a wrap." });
    await expect(answer.or(wrap)).toBeEnabled({ timeout: 20_000 });
    if (await wrap.isVisible()) break;
    await answer.fill(`I owned the migration end to end and cut latency by 40% (answer ${i + 1}).`);
    await page.getByRole("button", { name: /^Send/ }).click();
    if (i === 0) {
      await expect(page.getByText(/Question 2 of 4|follow-up/)).toBeVisible({ timeout: 20_000 });
      await page.reload(); // the interview lives on the server
      await page.getByText(/Transcript \(/).click();
      await expect(page.getByText("(answer 1)")).toBeVisible();
    }
  }
  await expect(page.getByText("Interview finished")).toBeVisible();
  await page.getByRole("button", { name: /Get my report/ }).click();
  await expect(page.getByRole("heading", { name: /How it/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel(/Overall score \d+ out of 100/)).toBeVisible();
  await page.getByRole("button", { name: /Add to my learning queue/ }).first().click();
  await expect(page.getByText("In your learning queue").first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole("link", { name: "Today" }).first().click();
  await expect(page.getByText("from interview").first()).toBeVisible();
  await page.getByRole("link", { name: "Progress" }).first().click();
  await expect(page.getByText("Backend Engineer at Razorpay")).toBeVisible();
});

test("ending early with no answers goes back to setup", async ({ page }) => {
  await signUp(page);
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
