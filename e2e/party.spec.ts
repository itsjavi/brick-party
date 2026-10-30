import { expect, test, type Browser, type Page } from "@playwright/test";

async function newPlayer(browser: Browser, nickname: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await page.getByLabel("Nickname").fill(nickname);
  await page.getByRole("button", { name: "Let's party!" }).click();
  await expect(page.getByText("Your brick is ready!")).toBeVisible();
  await expect(page.getByRole("status", { name: "Recovery key" })).toContainText(/^BRIK-/);
  await page.getByRole("button", { name: "Got it, let's play" }).click();
  await expect(page.getByRole("button", { name: "Create a room" })).toBeVisible();
  return page;
}

test("three players make bricks, join a room, play a round, and reach the report", async ({ browser }) => {
  const host = await newPlayer(browser, "Host Hana");
  const bea = await newPlayer(browser, "Bea Bot");
  const cal = await newPlayer(browser, "Cal Churn");

  await host.getByRole("button", { name: "Create a room" }).click();
  await expect(host).toHaveURL(/\/r\/[A-Z]{4}$/);
  const code = host.url().split("/").pop()!;

  // One joins by link, the other by typing the code on the title screen.
  await bea.goto(`/r/${code}`);
  await cal.getByLabel("Got a code?").fill(code.toLowerCase());
  await cal.getByRole("button", { name: "Join", exact: true }).click();
  await expect(cal).toHaveURL(new RegExp(`/r/${code}$`));

  for (const page of [host, bea, cal]) {
    await expect(page.getByRole("heading", { name: "Who's here" })).toBeVisible();
    await expect(page.getByText("Cal Churn").first()).toBeVisible();
  }
  await expect(bea.getByText(/Waiting for .*Host Hana/)).toBeVisible();

  // Chat reaches everyone.
  await bea.getByRole("button", { name: "Chat" }).click();
  await bea.getByLabel("Message").fill("who brought snacks");
  await bea.getByLabel("Message").press("Enter");
  await expect(host.getByText("who brought snacks")).toBeVisible();

  // Reactions are accepted (they float up on everyone's screen).
  await cal.getByRole("button", { name: "Laughing" }).click();

  await host.getByRole("button", { name: "START THE PARTY" }).click();

  // Each game opens with its rules; it starts once everyone is ready.
  for (const page of [host, bea, cal]) {
    await expect(page.getByText("How to play")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByRole("heading", { name: "Worst Feedback Ever" })).toBeVisible();
    await page.getByRole("button", { name: "Got it!" }).click();
  }
  for (const page of [host, bea, cal]) {
    await expect(page.getByText("Answer the survey!")).toBeVisible();
  }

  // The rules stay one click away during the game.
  await bea.getByRole("button", { name: "How to play" }).click();
  await expect(bea.getByRole("dialog")).toContainText("Vote for the funniest answer");
  await bea.getByRole("button", { name: "Back to the game" }).click();
  await expect(bea.getByRole("dialog")).toBeHidden();

  // Everyone plays a card; the round moves straight to voting.
  for (const page of [host, bea, cal]) {
    await page.locator("button[aria-pressed]").first().click();
    await page.getByRole("button", { name: "Play this card" }).click();
  }
  for (const page of [host, bea, cal]) {
    await expect(page.getByText("Vote for the worst!")).toBeVisible();
  }
  for (const page of [host, bea, cal]) {
    await page.getByRole("button", { name: "Promote" }).first().click();
  }
  await expect(host.getByText("The people have spoken")).toBeVisible();

  // The host ends the match early: everyone gets the Retro Report.
  await host.getByRole("button", { name: "End match" }).click();
  for (const page of [host, bea, cal]) {
    await expect(page.getByRole("heading", { name: "Retro Report" })).toBeVisible();
  }
  await expect(host.getByRole("link", { name: "Shareable report" })).toBeVisible({ timeout: 30_000 });

  await host.getByRole("link", { name: "Shareable report" }).click();
  await expect(host.getByRole("heading", { name: "Retro Report" })).toBeVisible();
  await host.goto("/hall-of-fame");
  await expect(host.getByRole("heading", { name: "Hall of Fame" })).toBeVisible();
  await expect(host.getByText("Host Hana").first()).toBeVisible();
});

test("a recovery key restores the same brick in another browser", async ({ browser }) => {
  const first = await browser.newContext();
  const page = await first.newPage();
  await page.goto("/");
  await page.getByLabel("Nickname").fill("Keyholder");
  await page.getByRole("button", { name: "Let's party!" }).click();
  const key = (await page.getByRole("status", { name: "Recovery key" }).textContent())!.trim();
  expect(key).toMatch(/^BRIK-/);
  await page.getByRole("button", { name: "Got it, let's play" }).click();

  const second = await browser.newContext();
  const other = await second.newPage();
  await other.goto("/");
  await other.getByText("Played before? Bring your brick back").click();
  await other.getByLabel("Recovery key").fill(` ${key.toLowerCase()} `);
  await other.getByRole("button", { name: "Restore" }).click();
  await expect(other.getByRole("button", { name: "Create a room" })).toBeVisible();
  await expect(other.getByRole("link", { name: "Edit your brick" })).toContainText("Keyholder");
});
