// Renders the share card at /dev/og into apps/web/public/og-image.png, the picture chat apps and
// social sites show for links to the site. Run it with the dev server up after changing the card.
// Usage: pnpm og-image
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:5173";
const out = new URL("../apps/web/public/og-image.png", import.meta.url);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto(`${base}/dev/og`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("main > *").first().screenshot({ path: out.pathname });
  console.log(`Saved ${out.pathname}`);
} finally {
  await browser.close();
}
