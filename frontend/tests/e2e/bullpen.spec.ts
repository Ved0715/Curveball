import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page is wider than the viewport").toBeLessThanOrEqual(1);
}

/** Talks to /api/mcp exactly like a coding agent would (JSON-RPC over Streamable HTTP). */
function agent(request: APIRequestContext, token: string) {
  let id = 0;
  return async (tool: string, args: Record<string, unknown>) => {
    const r = await request.post("/api/mcp", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      data: { jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name: tool, arguments: args } },
    });
    expect(r.ok()).toBeTruthy();
    const result = (await r.json()).result;
    expect(result.isError, result.content?.[0]?.text).toBeFalsy();
    return result.structuredContent?.result ?? result.structuredContent;
  };
}

test("Bullpen: cross into the Work world, an agent plans over MCP, the tree updates live, back to Learn", async ({
  page,
  request,
}, info) => {
  const mobile = info.project.name === "mobile";
  const email = `bp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Asha Rao");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill("correct horse 1");
  await page.getByRole("button", { name: /Create account/ }).click();
  await expect(page).toHaveURL(/\/today$/);

  // Enter the Work world through its door.
  await page.getByRole("button", { name: mobile ? "Enter Bullpen" : /Bullpen/ }).first().click();
  await expect(page).toHaveURL(/\/bullpen$/);
  await expect(page.locator("html")).toHaveAttribute("data-world", "work");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("one leaf");
  await expect(page.getByText("Nothing on the board yet")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Make a token for the agent.
  await page.getByRole("link", { name: /Connect an agent/ }).first().click();
  await page.getByLabel(/Name it after/).fill("Playwright agent");
  await page.getByRole("button", { name: /Create token/ }).click();
  const token = (await page.locator("pre").filter({ hasText: /^cbk_/ }).first().innerText()).trim();
  expect(token).toMatch(/^cbk_/);
  await expect(page.getByText("Your new token is already filled in.")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // The agent plans the work over MCP (it shares the browser's origin, not its cookie).
  const call = agent(request, token);
  const made = await call("create_session", { title: "Fix flaky checkout tests", repo: "acme/shop", agent: "claude-1" });
  const sid = made.session.id as string;
  const kids = await call("decompose_node", {
    session_id: sid,
    node_id: made.root_id,
    agent: "claude-1",
    children: [
      { title: "Reproduce the flake", files: ["tests/checkout.spec.ts"] },
      { title: "Fix the race in cart totals", files: ["cart.ts"], after: [0] },
    ],
  });

  await page.goto(`/bullpen/${sid}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fix flaky checkout tests");
  const tree = page.getByRole("list", { name: "Task tree" });
  await expect(tree.getByRole("button", { name: /Reproduce the flake/ })).toBeVisible();

  // While we watch, the agent ships the first leaf: the page catches up without a reload.
  await call("claim_node", { session_id: sid, node_id: kids[0].id, agent: "claude-1" });
  await call("set_status", {
    session_id: sid,
    node_id: kids[0].id,
    status: "done",
    agent: "claude-1",
    solution_description: "Reproduced by running the suite with a 50ms clock skew.",
  });
  await expect(page.getByRole("img", { name: "1 of 2 leaves resolved" })).toBeVisible({ timeout: 10_000 });
  await expectNoHorizontalScroll(page);

  // Finish the second leaf by hand, from the inspector.
  await tree.getByRole("button", { name: /Fix the race in cart totals/ }).click();
  const solution = page.getByLabel("Solution");
  await solution.fill("Totals now read from one snapshot, so concurrent adds can't interleave.");
  await solution.blur();
  await expect(page.getByText("Saved").first()).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("Shipped").first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Learn the concept behind this/ }).click();
  await expect(page.getByText("Queued in Learn")).toBeVisible();
  if (mobile) await page.keyboard.press("Escape");

  // Back through the door to Learn: the world changes back, and the topic is waiting.
  await page.getByRole("button", { name: /Back to/ }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator("html")).not.toHaveAttribute("data-world", "work");
  await expect(page.getByText("from your Bullpen work").first()).toBeVisible();
});

test("Bullpen routes are protected and MCP needs a token", async ({ page, request }) => {
  await page.goto("/bullpen");
  await expect(page).toHaveURL(/\/login\?next=%2Fbullpen/);
  const r = await request.post("/api/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  expect(r.status()).toBe(401);
});

test("Bullpen crossing: reduced motion skips the wave, and a double click doesn't stack it", async ({ page }) => {
  const email = `bp-safe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Asha Rao");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill("correct horse 1");
  await page.getByRole("button", { name: /Create account/ }).click();
  await expect(page).toHaveURL(/\/today$/);

  // Reduced motion: an instant swap, no wave ever drawn.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: /Bullpen/ }).first().click();
  await expect(page).toHaveURL(/\/bullpen$/);
  await expect(page.locator("html")).not.toHaveAttribute("data-crossing", /.+/);
  expect(await page.locator("svg.pointer-events-none.fixed").count()).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // A double click on the way back starts exactly one crossing, and nothing is left stuck.
  const back = page.getByRole("button", { name: /Back to/ });
  // A real rapid double click, not `force: true`: forcing bypasses Playwright's own
  // actionability check, so a mistimed force-click can land on a *different* element once the
  // first click has already started navigating - a Playwright footgun, not a product bug. A
  // short timeout on the second click means "the button is already gone" fails fast and clean.
  await back.click();
  await back.click({ timeout: 1000 }).catch(() => {});
  await expect(page).toHaveURL(/\/today$/);
  await page.waitForTimeout(1200); // past WAVE_MS, so any leftover overlay would still be visible
  await expect(page.locator("html")).not.toHaveAttribute("data-crossing", /.+/);
  await expect(page.locator("html")).not.toHaveAttribute("data-world", "work");
  expect(await page.locator("svg.pointer-events-none.fixed").count()).toBe(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoHorizontalScroll(page);
});
