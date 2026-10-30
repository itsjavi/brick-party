import { chromium } from "@playwright/test";

const names = [
  "Bot Bea",
  "Bot Cal",
  "Bot Dee",
  "Bot Eli",
  "Bot Fox",
  "Bot Gus",
  "Bot Hal",
  "Bot Ivy",
  "Bot Jo",
  "Bot Kit",
  "Bot Lou",
];
const colors = ["coral", "sun", "grape", "lime", "rose", "sky"];
const faces = ["glasses", "blush", "brows", "freckles", "shades", "mustache", "cyclops"];
const shapes = ["brick", "round", "triple", "jelly", "slim", "tile"];

/**
 * Makes `count` new players in a headless browser and sends them into room `code`. They stay idle;
 * the game plays their turns when timers run out. Close the returned browser to remove them; the
 * caller handles Ctrl+C, since Playwright's own handler would exit before the caller cleans up.
 */
export async function addBots(base, code, count) {
  const browser = await chromium.launch({ handleSIGINT: false });
  for (let i = 0; i < count; i++) {
    const name = names[i % names.length];
    const page = await (await browser.newContext()).newPage();
    await page.goto(base);
    await page.getByLabel("Nickname").fill(name);
    await page.locator(`input[name="color"][value="${colors[i % colors.length]}"]`).check({ force: true });
    await page.locator(`input[name="face"][value="${faces[i % faces.length]}"]`).check({ force: true });
    await page.locator(`input[name="shape"][value="${shapes[i % shapes.length]}"]`).check({ force: true });
    await page.getByRole("button", { name: "Let's party!" }).click();
    await page.getByRole("button", { name: "Got it, let's play" }).click();
    await page.goto(`${base}/r/${code}`);
    console.log(`${name} joined ${code}`);
  }
  return browser;
}
