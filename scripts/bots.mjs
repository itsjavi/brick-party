// Adds bot players to a local room so you can try the game alone.
// Usage: pnpm bots BRKZ [count]   (needs `pnpm --dir apps/web dev` running; `pnpm play` does it all)
import { addBots } from "./lib/bots.mjs";

const [code, count = "2"] = process.argv.slice(2);
if (!code) {
  console.error("Usage: pnpm bots <ROOM CODE> [count]");
  process.exit(1);
}
const base = process.env.BASE_URL ?? "http://localhost:5173";

const browser = await addBots(base, code.toUpperCase(), Number(count));
console.log("Bots are idle; the game plays their turns when timers run out. Ctrl+C to remove them.");
process.on("SIGINT", async () => {
  await browser.close();
  process.exit(0);
});
await new Promise(() => {});
